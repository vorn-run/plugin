/**
 * Vorn plugin for opencode.
 *
 * opencode plugins are code, not markdown — the SKILL.md files in this repo are
 * consumed by Claude Code, Copilot CLI and Codex, but opencode has its own skills
 * feature and does not load them from a plugin. So the same knowledge reaches an
 * opencode session a different way: as context pushed in at session start and,
 * critically, re-pushed at compaction.
 *
 * That compaction hook is the reason this file exists. Everywhere else, context
 * injected into the conversation is summarised away when the window fills.
 * `experimental.session.compacting` lets us put it back.
 */

const VORN_CONTEXT = `You are running inside Vorn, an orchestrator for parallel coding agents.
Your \`vorn\` MCP tools are not just project bookkeeping — they let you:

- Drive a real browser in your own pane: \`open_browser_pane\` first, then
  \`browser_navigate\`, \`read_page\` (accessibility tree with refs — prefer it over
  \`browser_screenshot\`), \`browser_interact\`, \`read_console_messages\`,
  \`read_network_requests\`. Verify your work against the running app.
- Run other agents in parallel: \`launch_session\` (pass use_worktree when it will
  edit files), then \`read_session_output\` and \`write_to_terminal\` to steer them.
- Trigger and build workflows: \`execute_workflow\`, \`create_workflow\`,
  \`list_workflow_runs\` to see why a past run behaved as it did.

Call \`get_my_context\` at any time to re-fetch your session, project and task.`

/** True when this process was started by the Vorn app. */
function inVornSession(env = process.env) {
  const id = env.VORN_SESSION_ID
  return typeof id === 'string' && id.length > 0
}

export const VornPlugin = async ({ client }) => {
  if (!inVornSession()) {
    // Started outside Vorn: no session, no pane, nothing to announce.
    return {}
  }

  return {
    /**
     * Re-inject after compaction.
     *
     * Without this the announcement above is summarised away with the rest of
     * the early conversation, and a long session quietly forgets it can drive a
     * browser or start a sibling agent.
     */
    'experimental.session.compacting': async (_input, output) => {
      try {
        output.context.push(VORN_CONTEXT)
      } catch (err) {
        await client?.app?.log?.({
          level: 'warn',
          message: `vorn: could not re-inject context on compaction: ${err}`
        })
      }
    }
  }
}
