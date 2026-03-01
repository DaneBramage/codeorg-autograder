# Contributing to Code.org Autograder

Thanks for your interest in improving the autograder! This project is built by teachers for teachers — you don't need to be a developer to contribute.

> **Note:** This project is maintained in my spare time. I may not respond quickly to issues or review all pull requests. Feel free to fork and adapt for your own needs!

## Report a Bug or Request a Feature

The easiest way to contribute is to [open an issue](../../issues) on GitHub:

1. Go to the **Issues** tab at the top of the repository page
2. Click **New issue**
3. Give it a short, descriptive title
4. Describe the problem or idea — include the LevelID, any error messages, and what you expected to happen
5. Click **Submit new issue**

Helpful details to include:
- **Bug reports:** Which LevelID? What did the student submit? What score/status did the autograder give vs. what you expected?
- **Setup problems:** Are you on a school Google Workspace or personal Gmail? What step did you get stuck on?

## Share Criteria for a Different Course

Have criteria for a course or unit that isn't covered yet? You can contribute a CSV file — no coding required:

1. Create a CSV with columns: `LevelID,CriterionID,Points,Type,Description` (see the existing CSV in `criteria/` for an example)
2. If you're comfortable with GitHub: fork the repo, add your CSV to the `criteria/` folder, and open a pull request
3. If not: [open an issue](../../issues), attach your CSV file, and describe which course/unit it covers — I'll add it to the repo

## Submit Code Changes

For developers who want to modify `Code.gs` or fix bugs:

1. Fork the repository
2. Make your changes to `Code.gs` (for script changes) or add/edit CSV files in `criteria/` (for rubric changes)
3. Test in a real Google Sheet (paste into Apps Script, run Initial Setup, import criteria CSV, grade a few submissions)
4. Open a pull request with a clear description of what changed and why

## Understanding the Criteria Workflow

Criteria live in **CSV files** in the `criteria/` folder. Teachers import them into the **Criteria sheet** via Google Sheets' built-in File → Import feature.

| Location | Purpose |
|---|---|
| `criteria/*.csv` (files in repo) | Shareable rubric definitions — one CSV per curriculum unit |
| **Criteria sheet** (in Google Sheets) | **Runtime source of truth** — the grading engine reads from here |

**How it works:**
- Teachers import a CSV into the Criteria sheet (File → Import → Upload → "Replace current sheet").
- The grading engine reads criteria exclusively from the **Criteria sheet** at runtime.
- Teachers can edit the Criteria sheet directly (tweak descriptions, adjust points) and those changes take effect immediately.
- There is no embedded CSV in `Code.gs` — criteria and code are completely decoupled.

**For developers adding/changing criteria:**
1. Edit the appropriate CSV file in `criteria/` (or create a new one for a different curriculum).
2. Import it into the Criteria sheet in your test spreadsheet (File → Import → "Replace current sheet").
3. Grade a known submission to verify the new criteria work as expected.

> **Tip:** Since criteria live in a plain CSV file, anyone can contribute new rubrics for different courses or units without touching `Code.gs` at all.

## Adding a New Level

1. **Add criteria rows** to the appropriate CSV in `criteria/`:
   ```
   LevelID,CriterionID,Points,Type,Description
   Lesson-XX-Level-YY,criterion_name,3,llm_check,"Description of what to check"
   ```
   Use zero-padded numbers (e.g., `Lesson-03-Level-08`) so levels sort correctly.

2. **Import the CSV** into the Criteria sheet (File → Import → "Replace current sheet").

3. **Test** by grading a known submission for that level.

### Criterion Types

All criteria use `llm_check` — the LLM evaluates each criterion against the student's source code and decides pass/fail with a reason. There are no local/regex check types; the LLM handles everything.

## Code Style

> 📐 For a deeper dive into the architecture, sheet layout, data flow, and key design decisions, see [PLAN.md](PLAN.md).

- This is Google Apps Script (ES5-compatible JavaScript) — no `let`/`const`, no arrow functions, no template literals
- Use `var` for all variable declarations
- Functions intended as internal helpers use a trailing underscore: `myHelper_()`
- Keep the section numbering and separator comments consistent

## Testing

There's no automated test suite (it's Apps Script). Manual testing workflow:

1. Paste `Code.gs` into a Google Sheet's Apps Script editor
2. Run **Initial Setup** → verify all sheets created correctly
3. Import a criteria CSV into the Criteria sheet
4. Run **Test API Connection** → verify both checks pass
5. Grade a known submission → verify score matches expectations
6. Test the email flow on a test row

## Questions?

[Open an issue](../../issues) — happy to help when I have time! Not a GitHub user? Reach out via the email listed in the forum post where you found this project.
