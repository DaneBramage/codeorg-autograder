# 🎮 Game Lab Autograder

Automatically grades [Code.org Game Lab](https://code.org/educate/gamelab) student projects using AI (Gemini or OpenAI).

Students submit their share links via a Google Form. The autograder fetches their code, evaluates it against rubric criteria using an LLM, writes the score to a spreadsheet, and emails students their results — all automatically.

Built for the **CSD Unit 3 (Interactive Animations and Games)** curriculum.

---

## 🚀 Quick Setup

### 1. Create the Google Sheet

- Create a new Google Sheet (or open an existing one)
- Go to **Extensions → Apps Script**
- Delete any existing code in `Code.gs`
- Paste the entire contents of [`Code.gs`](Code.gs) from this repo
- Click **Save** (💾)
- Close the Apps Script editor and **reload the spreadsheet**

### 2. Run Initial Setup

- In the spreadsheet, click **Autograder → Initial Setup…**
- Check the class periods you teach (1–8)
- Click **Create Sheets**

This creates:

| Sheet | Purpose |
|---|---|
| **Submissions** | All student submissions and grades (one row per submission) |
| **Criteria** | Empty rubric sheet (you'll import a CSV next) |
| **Grade View P#** | One per period — read-only views sorted by level then last name |

### 3. Import Criteria

1. Switch to the **Criteria** sheet tab
2. **File → Import → Upload** → pick a criteria CSV from the `criteria/` folder in this repo (e.g., `CSD-Unit3-Interactive-Animations-and-Games.csv`)
3. Set **Import location** to **"Replace current sheet"** and **Separator type** to **"Detect automatically"**
4. Click **Import data**

> 💡 To switch to a different set of criteria later, just import a new CSV into the Criteria sheet. Your Submissions and Grade Views are never affected.

### 4. Set your API Key

- Go to **Extensions → Apps Script → ⚙️ Project Settings → Script Properties**
- Click **Add script property**
- Name: `GEMINI_API_KEY`
- Value: your Gemini API key (free at [aistudio.google.com](https://aistudio.google.com))

> 📺 **New to Google API keys?** Watch this [1-minute tutorial on YouTube](https://www.youtube.com/watch?v=qMyOoAe9DS4) for a quick walkthrough.

> **Optional:** To use OpenAI instead, add two properties:
> - `LLM_PROVIDER` = `openai`
> - `OPENAI_API_KEY` = your OpenAI key

### 5. Test your connection

- Click **Autograder → Test API Connection**
- This runs two tests: a basic connectivity check and a structured JSON grading test
- You should see ✅ for both

### 6. Create & Link a Google Form

- Click **Autograder → Create Submission Form**
- This automatically creates a Google Form with the correct fields, links it to your spreadsheet, and installs the auto-grade trigger
- You'll see a dialog with the student-facing URL to share

**Done!** When a student submits, their code is automatically graded and emailed.

<details>
<summary>Manual alternative (if you prefer to create the form yourself)</summary>

Create a Google Form with these fields:

| Field | Type | Notes |
|---|---|---|
| Email Address | Built-in setting | Form Settings → Collect email addresses |
| First Name | Short answer | |
| Last Name | Short answer | |
| Class Period | Dropdown | 1, 2, 3, 4, 5, 6, 7, 8 (match your periods) |
| Assessment Level | Dropdown | Copy LevelIDs from the Criteria sheet |
| Share URL | Short answer | Students paste their Code.org share link |

Then link it to your spreadsheet:

1. In the Form editor → **Responses** tab → click the green **Sheets** icon
2. Choose **Select existing spreadsheet** → pick your autograder spreadsheet
3. This creates a "Form Responses 1" sheet

Set up the auto-grade trigger:

1. In **Extensions → Apps Script**, click the ⏰ **Triggers** icon (left sidebar)
2. Click **+ Add Trigger**
3. Function: `onFormSubmit` | Source: **From spreadsheet** | Event: **On form submit**
4. Leave deployment set to **Head**
5. Click **Save** and authorize when prompted

</details>

### ⚠️ Authorization & Permissions

The first time you run any Autograder menu action (or when a trigger fires), Google will ask you to authorize the script. You'll see two screens:

**1. "Google hasn't verified this app"** — This is normal. Every Apps Script that hasn't been published to the Google Workspace Marketplace shows this warning. Since you own this copy of the script and it runs entirely in your own Google account, it's safe to proceed:
- Click **Advanced**
- Click **Go to Auto-Grader Script (unsafe)**

**2. Permission checkboxes** — Google asks you to approve each permission the script needs. **Yes, check all boxes.** Here's what each one does and why it's required:

| Permission | Why the autograder needs it |
|---|---|
| **Read, compose, send… email from Gmail** | Sends grading results to students via `GmailApp.sendEmail()`. The script never reads or deletes your emails. |
| **See, edit, create… Google Sheets** | Reads/writes the Submissions, Criteria, and Grade View sheets — this is the core of the autograder. |
| **View and manage your forms in Google Drive** | Only used by **Create Submission Form** to build the Google Form. You can skip this if you create the form manually. |
| **Connect to an external service** | Calls the Gemini or OpenAI API to grade student code, and fetches student source code from `studio.code.org`. |
| **Allow this application to run when you are not present** | Enables the `onFormSubmit` trigger to auto-grade submissions even when you don't have the spreadsheet open. |
| **Display and run third-party web content…** | Powers the setup dialog and help panel that appear inside the spreadsheet (Apps Script `HtmlService`). |

> **🔒 Privacy note:** The script runs entirely in your own Google account. Your API keys are stored in your script's properties (not shared). Student code is sent only to the LLM API you configure. No data is sent to the autograder developer or any third party beyond the LLM provider. You can review the complete source code in [Code.gs](Code.gs).

> **📧 Note on emails:** Student result emails use Google's built-in `GmailApp` service, authorized when you approve the trigger. Gmail limits: ~100 emails/day (consumer) or ~1,500/day (Google Workspace).

---

## 📋 Menu Reference

All menu actions operate on the **Submissions** sheet — never on Form Responses directly.

| Menu Item | What it does | Use this when… |
|---|---|---|
| **Initial Setup…** | Creates Submissions, Criteria, and Grade View sheets (additive — won't overwrite existing) | First-time setup, or adding a new period mid-year |
| ↓ *Reset Everything* | Deletes Submissions, Criteria, and all Grade View P# sheets. Form Responses 1 is not affected. (Inside the Setup dialog) | Starting a fresh semester, or something is badly broken |
| **Grade New Submissions** | Imports any new form responses into Submissions, then grades all ungraded rows | Daily workflow — checking in on student progress |
| **Re-grade Selected Rows** | Re-grades only the rows you highlight in Submissions | You edited criteria and want to test the change on a few rows |
| **Re-grade All Rows…** | Re-grades every submission (slow, uses API credits) | You changed criteria and want to recalculate all scores |
| **Grade & Email All New** | Imports, grades, and emails results for all un-emailed students in one step | Batch grading at the end of a class or day |
| **Email Selected Rows** | Sends result emails for rows you highlight in Submissions (re-sends even if already emailed) | Re-sending updated grades after re-grading, or sending after manual review |
| **Create Submission Form** | Creates a Google Form with the correct fields, links it to this spreadsheet, and installs the onFormSubmit trigger | First-time setup — replaces manual form creation |
| **Test API Connection** | Verifies API key and structured JSON grading in one combined test | After initial setup, or when troubleshooting |
| **Help / Setup Guide** | Opens the in-app help dialog | Any time you need a quick reference |

---

## 📄 Sheet Reference

### Submissions

The main data sheet. One row per submission. All grading reads/writes happen here.

| Column | Description |
|---|---|
| Timestamp | When the form was submitted |
| First | Student's first name |
| Last | Student's last name |
| Period | Class period (1–8) |
| Email | Student's email address |
| LevelID | Which level they submitted (e.g., `Lesson-03-Level-08`) |
| ShareURL | Their Code.org share link |
| ChannelID | Auto-extracted from the share link |
| Score | Points earned |
| MaxScore | Total possible points for that level |
| Status | `OK`, `Error`, `Invalid share link`, etc. |
| Notes | Per-criterion ✅/❌ breakdown |
| EmailedAt | Timestamp when the result email was sent |

### Grade View P#

Read-only formula sheets (one per period). Automatically filters and sorts Submissions by period, then by level and last name. Rows are alternately shaded by level group (white/gray) so you can quickly see where one level's submissions end and the next begins. **Protected** — don't edit these directly.

### Criteria

The rubric. Imported from a CSV file (see `criteria/` folder). You can edit descriptions or point values directly in the sheet to customize grading. To load a completely different rubric, import a new CSV (File → Import → "Replace current sheet").

---

## 🧪 Supported Levels

| LevelID | Criteria | Description |
|---|---|---|
| Lesson-03-Level-08 | 4 | Purple rect on top of ellipses |
| Lesson-04-Level-08 | 2 | Cloud wider than tall |
| Lesson-05-Level-07 | 5 | Both eyes use eyeSize variable |
| Lesson-06-Level-07 | 4 | Complete the caterpillar |
| Lesson-08-Level-10 | 3 | Sprite animations |
| Lesson-09-Level-05 | 3 | Shrink the food |
| Lesson-10-Level-05 | 3 | Adding text |
| Lesson-12-Level-07 | 4 | The draw loop |
| Lesson-13-Level-07 | 4 | Swimming fish |
| Lesson-15-Level-07 | 1 | Transforming dinosaur |
| Lesson-16-Level-06 | 4 | Flyer movement controls |
| Lesson-17-Level-07 | 3 | Shake the creature |
| Lesson-19-Level-09 | 4 | Fish with velocity |
| Lesson-20-Level-07 | 1 | Horse to unicorn |
| Lesson-21-Side-Scroller | 16 | Side-scroller game project |
| Lesson-22-Level-06 | 1 | Rock falls back down |

---

## ⚙️ Configuration

### Script Properties

Set in **Extensions → Apps Script → ⚙️ Project Settings → Script Properties**:

| Property | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes (default) | Your Gemini API key ([get one free](https://aistudio.google.com)) |
| `OPENAI_API_KEY` | If using OpenAI | Your OpenAI API key |
| `LLM_PROVIDER` | No | `gemini` (default) or `openai` |

---

## 🔄 How Grading Works

1. Student submits a Google Form with their share link and level
2. `onFormSubmit` trigger fires → copies data to the Submissions sheet
3. Channel ID is extracted from the share URL
4. Student source code is fetched from `studio.code.org`
5. A cache key (SHA-256 of LevelID + criteria + source code) is checked
6. If not cached: rubric criteria are sent to the LLM with the source code
7. LLM returns JSON with pass/fail for each criterion
8. Score is calculated and written to the row
9. Result is cached for 6 hours
10. A results email is sent to the student (rows with `Status = Error` are skipped — see below)

**Grade New Submissions** automatically imports any missed form responses before grading, so it works as both a catch-up tool and a manual grade trigger.

### Rate Limit Handling

The free Gemini API tier has per-minute rate limits. When multiple students submit at the same time, some requests may get a `429 Too Many Requests` response. The autograder handles this automatically:

- All LLM API calls use **exponential backoff** — on a 429 or 503, it waits ~2s, then ~4s, ~8s, ~16s (with jitter) before retrying, up to 4 attempts.
- Total max wait is ~30 seconds per request, well within Apps Script's 6-minute execution limit.
- If retries are exhausted, the row is marked `Status = Error` with the error message. **Students will not receive an email for Error rows** — this prevents sending confusing error text to students. You can re-grade those rows later with **Re-grade Selected Rows**.
- The `Error` email guard applies to all automatic flows (`onFormSubmit`, `Grade & Email All New`). If you manually run **Email Selected Rows**, it will send to all selected rows regardless of status.

### Criterion Types

All criteria use `llm_check` — each criterion is sent to the LLM along with the student's source code, and the LLM returns pass/fail with a reason.

---

## 🛠 Troubleshooting

| Problem | Solution |
|---|---|
| **"Missing GEMINI_API_KEY"** | Set the script property in Extensions → Apps Script → ⚙️ Project Settings → Script Properties |
| **"Invalid share link"** | Student's URL doesn't match `studio.code.org/projects/gamelab/...` — have them re-copy the share link |
| **"No criteria found"** | The LevelID submitted doesn't match any LevelID in your Criteria sheet — check for typos in the form or criteria CSV |
| **Rows showing `Error` status** | Usually a rate limit (429) that exhausted retries. Select the Error rows and run **Re-grade Selected Rows** — the retry logic will handle the backoff. |
| **Submissions aren't auto-importing** | Verify the `onFormSubmit` trigger is set up (Extensions → Apps Script → Triggers). Use **Grade New Submissions** to catch up. |
| **Students not receiving emails** | Check that the Email column has valid addresses and EmailedAt is blank. Rows with `Status = Error` are intentionally skipped to avoid emailing error text to students. Gmail has daily sending limits (~100/day consumer, ~1,500/day Workspace). |
| **"Please switch to the Submissions sheet"** | Selection-based actions (Re-grade Selected, Email Selected) require you to be on the Submissions sheet with rows highlighted |
| **Re-grading doesn't reflect my criteria edits** | Fixed in v2.2 — the cache key now includes criteria content. If you're on an older version, wait up to 6 hours for the cache to expire, or run **Reset Everything** and re-import. |

---

## 🏗 Project Structure

```
game-lab-autograder/
├── Code.gs                  # The complete Apps Script — paste into your spreadsheet
├── criteria/                # Rubric CSV files (import into the Criteria sheet)
│   └── CSD-Unit3-Interactive-Animations-and-Games.csv
├── README.md                # This file
├── CONTRIBUTING.md          # Developer & contributor guide
├── CHANGELOG.md             # Version history
├── PLAN.md                  # Architecture & design decisions (internal)
├── LICENSE                  # MIT License
└── .gitignore
```

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

If you're a teacher using this and have feedback, bug reports, or ideas for new levels/criteria, please [open an issue](../../issues).

---

## 📝 License

MIT — see [LICENSE](LICENSE). Built for teachers, by a teacher.
