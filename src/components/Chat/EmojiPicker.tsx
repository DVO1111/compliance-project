// src/components/Chat/EmojiPicker.tsx
import { useState } from 'react';

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
    {
        label: 'Smileys',
        emojis: ['😀', '😂', '🥹', '😍', '🤩', '😎', '🤔', '😏', '😢', '😡', '🥳', '🤯', '😱', '🫡', '👻', '💀', '🤖', '👽', '💩'],
    },
    {
        label: 'Gestures',
        emojis: ['👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '💪', '🫶', '❤️', '🔥', '⭐', '✅', '❌', '🚀', '💯', '🎯', '🏆', '💡'],
    },
    {
        label: 'Work',
        emojis: ['📝', '📋', '📌', '📎', '🔗', '💼', '📊', '📈', '⚖️', '🔍', '🛡️', '⚠️', '🔔', '💬', '📢', '🎉', '🎊', '☕', '🍕'],
    },
];

interface EmojiPickerProps {
    onSelect: (emoji: string) => void;
    onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
    const [search, setSearch] = useState('');

    const filteredCategories = search
        ? [{ label: 'Results', emojis: EMOJI_CATEGORIES.flatMap(c => c.emojis) }]
        : EMOJI_CATEGORIES;

    return (
        <div
            className="absolute bottom-full mb-2 left-0 w-72 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl z-50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="p-2 border-b border-[var(--color-border)]">
                <input
                    type="text"
                    placeholder="Search emoji…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                    autoFocus
                />
            </div>

            {/* Emoji grid */}
            <div className="max-h-52 overflow-y-auto p-2">
                {filteredCategories.map((cat) => (
                    <div key={cat.label}>
                        <p className="text-[10px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider px-1 mb-1">
                            {cat.label}
                        </p>
                        <div className="grid grid-cols-8 gap-0.5 mb-2">
                            {cat.emojis.map((emoji) => (
                                <button
                                    key={emoji}
                                    onClick={() => { onSelect(emoji); onClose(); }}
                                    className="w-8 h-8 flex items-center justify-center text-lg rounded-md hover:bg-[var(--color-surface-alt)] transition-colors"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
