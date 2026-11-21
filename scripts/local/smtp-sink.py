#!/usr/bin/env python3
"""
A throwaway SMTP server that writes what it is sent to disk.

    scripts/local/smtp-sink.py --dir <outdir> [--host 0.0.0.0] [--port 54325]

── WHY THIS EXISTS ──────────────────────────────────────────────────────────

The CLI's own mail catcher could not be used: `[inbucket]` is deprecated in
favour of mailpit in this CLI version, and the mailpit image would not pull
from any of the three registries the CLI tries. Without a catcher GoTrue has
nowhere to deliver, so the recovery email cannot be inspected at all.

So this takes mailpit's place for one purpose: capturing the message GoTrue
actually renders, headers and body, so the branded template can be checked
against what a recipient would receive rather than against the template file.

── WHAT IT IS NOT ───────────────────────────────────────────────────────────

It is not a mail server and it proves nothing about delivery. It accepts any
credentials, speaks no TLS, and delivers nowhere. That a message arrives here
says the template rendered and GoTrue handed it to an SMTP server — it says
NOTHING about whether real SMTP (Hostinger, in production) would accept it,
authenticate, pass SPF/DKIM/DMARC, or avoid a spam folder. Those are
separate facts and need a real send to a real mailbox.

Bound to loopback by default. `--host 0.0.0.0` is needed only because GoTrue
dials it from inside a container.
"""
from __future__ import annotations

import argparse
import asyncio
import email
import email.policy
import json
import time
from pathlib import Path

CRLF = b"\r\n"


class Session:
    """One SMTP conversation. Enough of RFC 5321 to be talked to, no more."""

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter,
                 outdir: Path) -> None:
        self.reader = reader
        self.writer = writer
        self.outdir = outdir
        self.sender = ""
        self.rcpts: list[str] = []

    async def reply(self, line: str) -> None:
        self.writer.write(line.encode() + CRLF)
        await self.writer.drain()

    async def run(self) -> None:
        await self.reply("220 criateur-local-sink ESMTP")
        while True:
            raw = await self.reader.readline()
            if not raw:
                return
            line = raw.decode("utf-8", "replace").rstrip("\r\n")
            verb, _, rest = line.partition(" ")
            verb = verb.upper()

            if verb == "EHLO":
                #  No STARTTLS advertised: a sink that offered TLS it cannot
                #  do would make GoTrue fail in a way that looks like a
                #  template problem.
                for line_out in (f"250-criateur-local-sink", "250-AUTH PLAIN LOGIN",
                                 "250-8BITMIME", "250 SMTPUTF8"):
                    await self.reply(line_out)
            elif verb == "HELO":
                await self.reply("250 criateur-local-sink")
            elif verb == "AUTH":
                #  Any credential is accepted. This is a sink; authenticating
                #  it would only be testing itself.
                if rest.upper().startswith("LOGIN") and len(rest.split()) == 1:
                    await self.reply("334 VXNlcm5hbWU6")
                    await self.reader.readline()
                    await self.reply("334 UGFzc3dvcmQ6")
                    await self.reader.readline()
                await self.reply("235 2.7.0 Authentication successful")
            elif verb == "MAIL":
                self.sender = rest
                await self.reply("250 2.1.0 Ok")
            elif verb == "RCPT":
                self.rcpts.append(rest)
                await self.reply("250 2.1.5 Ok")
            elif verb == "DATA":
                await self.reply("354 End data with <CR><LF>.<CR><LF>")
                await self.reply_after_data()
            elif verb == "RSET":
                self.sender, self.rcpts = "", []
                await self.reply("250 2.0.0 Ok")
            elif verb == "NOOP":
                await self.reply("250 2.0.0 Ok")
            elif verb == "QUIT":
                await self.reply("221 2.0.0 Bye")
                return
            else:
                await self.reply("502 5.5.2 Not implemented")

    async def reply_after_data(self) -> None:
        chunks: list[bytes] = []
        while True:
            line = await self.reader.readline()
            if not line or line.rstrip(b"\r\n") == b".":
                break
            #  Undo transparency: a body line of ".." was sent for a literal ".".
            chunks.append(line[1:] if line.startswith(b"..") else line)
        self.save(b"".join(chunks))
        await self.reply("250 2.0.0 Ok: queued")
        self.sender, self.rcpts = "", []

    def save(self, blob: bytes) -> None:
        msg = email.message_from_bytes(blob, policy=email.policy.default)
        stamp = f"{time.time():.6f}"
        self.outdir.mkdir(parents=True, exist_ok=True)
        (self.outdir / f"{stamp}.eml").write_bytes(blob)

        #  The parsed form is what the tests read, so they do not each have
        #  to re-implement quoted-printable decoding and multipart walking.
        bodies: dict[str, str] = {}
        for part in (msg.walk() if msg.is_multipart() else [msg]):
            if part.get_content_maintype() == "multipart":
                continue
            try:
                bodies[part.get_content_type()] = part.get_content()
            except Exception:
                bodies[part.get_content_type()] = part.get_payload(decode=False) or ""
        (self.outdir / f"{stamp}.json").write_text(json.dumps({
            "envelope_from": self.sender,
            "envelope_to": self.rcpts,
            "headers": {k: str(v) for k, v in msg.items()},
            "subject": str(msg.get("Subject") or ""),
            "to": str(msg.get("To") or ""),
            "from": str(msg.get("From") or ""),
            "bodies": bodies,
        }, indent=2))
        print(f"captured {msg.get('Subject')!r} -> {self.outdir / (stamp + '.json')}",
              flush=True)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=54325)
    args = ap.parse_args()
    outdir = Path(args.dir)

    async def handle(r: asyncio.StreamReader, w: asyncio.StreamWriter) -> None:
        try:
            await Session(r, w, outdir).run()
        except (ConnectionResetError, asyncio.IncompleteReadError):
            pass
        finally:
            w.close()

    server = await asyncio.start_server(handle, args.host, args.port)
    print(f"smtp sink on {args.host}:{args.port}, writing to {outdir}", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
