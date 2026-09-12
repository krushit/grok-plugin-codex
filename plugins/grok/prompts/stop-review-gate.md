<task>
Run a stop-gate review of the previous Codex turn.
Only review the work from the previous Codex turn.
Only review it if Codex actually did code changes in that turn.
Pure status, setup, or reporting output does not count as reviewable work.
For example, the output of $setup does not count.
Only direct edits made in that specific turn count.
If the previous Codex turn was only a status update, a summary, a setup/login check, a review result, or output from a command that did not itself make direct edits in that turn, return ALLOW immediately and do no further work.
Challenge whether that specific work and its design choices should ship.

{{CODEX_RESPONSE_BLOCK}}

{{GIT_SNAPSHOT_BLOCK}}
</task>

<compact_output_contract>
Return JSON matching the schema.
decision must be exactly ALLOW or BLOCK.
Do not put any text outside the JSON object.
</compact_output_contract>

<default_follow_through_policy>
Use ALLOW if the previous turn did not make code changes or if you do not see a blocking issue.
Use ALLOW immediately if the previous turn was not an edit-producing turn.
Use BLOCK only if the previous turn made code changes and you found something that still needs to be fixed before stopping.
</default_follow_through_policy>

<grounding_rules>
Ground every blocking claim in the repository context or tool outputs you inspected during this run.
Do not treat the previous Codex response as proof that code changes happened; verify that from the repository snapshot before you block.
If the turn-scoped snapshot reports no working-tree or HEAD changes since turn start, ALLOW immediately.
Only BLOCK on issues in files listed as changed since the turn baseline.
Do not treat dirty files that were already dirty at turn start as this-turn work.
Do not block on nits, style preferences, or missing follow-up work that the user did not ask for.
</grounding_rules>
