
export function generateEvidenceReport(params: {
  control: { reference_code: string; name: string };
  test: { test_name: string; provider_id: string };
  run: { status: string; result: string | null; executed_at: string; duration_ms: number; error_message: string | null; evidence_payload: any };
}): string {
  const { control, test, run } = params;
  const resultEmoji = run.result === 'pass' ? '✅' : run.result === 'fail' ? '❌' : '⚠️';
  const statusUpper = run.status.toUpperCase();
  const resultUpper = (run.result || 'UNKNOWN').toUpperCase();

  let report = `# GRC Automation Evidence Report\n\n`;
  report += `## Control Information\n`;
  report += `- **Control Reference**: ${control.reference_code}\n`;
  report += `- **Control Name**: ${control.name}\n\n`;

  report += `## Test Details\n`;
  report += `- **Test Name**: ${test.test_name}\n`;
  report += `- **Provider**: ${test.provider_id}\n`;
  report += `- **Execution Time**: ${new Date(run.executed_at).toLocaleString()}\n`;
  report += `- **Duration**: ${run.duration_ms}ms\n\n`;

  report += `## Execution Result\n`;
  report += `### ${resultEmoji} ${resultUpper} (${statusUpper})\n\n`;

  if (run.error_message) {
    report += `> **Error**: ${run.error_message}\n\n`;
  }

  if (run.evidence_payload && Object.keys(run.evidence_payload).length > 0) {
    report += `### Observations\n`;
    report += `\`\`\`json\n${JSON.stringify(run.evidence_payload, null, 2)}\n\`\`\`\n\n`;
  }

  report += `---\n`;
  report += `*Generated automatically by the Criateur GRC Automation Engine.*\n`;
  report += `*Attestation: This report constitutes a point-in-time automated verification of the control specified above.*`;

  return report;
}
