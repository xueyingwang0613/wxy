---
name: generate-work-review
description: Generate a local Chinese Codex work-review website from the installed user's ~/.codex/sessions transcripts, including daily activity, weekly summaries, project categories, message counts, and token usage. Use when the user asks for a 任务观察员、工作复盘网页、Codex 使用记录、按日期统计工作，或想生成/更新与“任务观察员”相同风格的网页版报告。
---

# Generate Work Review

Generate the bundled “任务观察员” website from the current user's local Codex sessions.

## Choose the date range

1. Look for an explicit range in the user's request. Accept forms such as `2026-05-01 到现在`, `26年5月至今`, `上个月`, or two ISO dates.
2. If no range is present, ask once: `想生成哪段日期？例如“2026 年 5 月到现在”。如果不指定，我会默认生成上月 1 日到今天。`
3. If the user does not answer, says to proceed, or has no preference, continue with the default: the first day of the previous calendar month through today, using the local timezone.
4. Treat `到现在` and `至今` as today. Confirm only if the range is ambiguous enough to change the result materially.

## Generate the website

Run:

```bash
node <skill-directory>/scripts/generate-review.mjs \
  --start YYYY-MM-DD \
  --end YYYY-MM-DD \
  --output <destination-directory>
```

Omit `--start` and `--end` to use the default range. If the user gives no output location, create `codex-work-review` in the current working directory. Do not overwrite unrelated files: the script refuses a non-report directory unless `--force` is passed.

The generator reads only `~/.codex/sessions`, excludes non-main sessions, aggregates dates in the system timezone, and writes a self-contained static site. It never uploads transcript contents.

## Verify and hand off

1. Check that `generated-data.js`, `index.html`, `app.js`, and `styles.css` exist in the output directory.
2. Report the resolved date range and output path.
3. To preview with manual refresh enabled, run `node <output>/scripts/review-server.mjs` and share the printed local URL. Do not start a long-running server unless the user asks to preview it.
4. Explain that the project/weekly judgments are heuristic summaries from local request text, while message and token counts come directly from session records.

## Updating an existing report

Run the generated copy of the updater:

```bash
node <output>/scripts/update-review-data.mjs
```

For reports created with the default range, each update recalculates “上月 1 日到今天.” Explicit ranges remain fixed.
