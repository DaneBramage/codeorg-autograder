/**
 * ============================================================================
 *  Game Lab Autograder v2  —  Google Apps Script
 * ============================================================================
 *
 *  Grades Code.org Game Lab projects against rubric criteria using an LLM.
 *
 *  Setup:
 *    1. Paste this entire file into Extensions → Apps Script → Code.gs
 *    2. Set GEMINI_API_KEY in Project Settings → Script Properties
 *    3. Run Autograder → Initial Setup… from the spreadsheet menu
 *    4. See README.md or Autograder → Help / Setup Guide for full instructions
 *
 *  Default LLM: Gemini 2.0 Flash
 *  Optional:    Set LLM_PROVIDER=openai and OPENAI_API_KEY for OpenAI
 * ============================================================================
 */

// ═══════════════════════════════════════════════════════════════════════════════
//  1. CONFIG & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

var SHEET_SUB    = 'Submissions';
var SHEET_CRIT   = 'Criteria';
var GRADE_VIEW_PREFIX = 'Grade View P';
var MAX_PERIODS  = 8;

var DEFAULT_PROVIDER = 'gemini';
var DEFAULT_MODEL_BY_PROVIDER = {
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o'
};

var SUB_HEADERS = [
  'Timestamp','First','Last','Period','Email','LevelID','ShareURL',
  'ChannelID','Score','MaxScore','Status','Notes','EmailedAt'
];

var GRADE_VIEW_HEADERS = [
  'LevelID','First','Last','Score','MaxScore','Status','Email','ShareURL','Timestamp','Notes'
];

// Column indices in Submissions (0-based) — kept in sync with SUB_HEADERS
var SC = {};
SUB_HEADERS.forEach(function(h, i) { SC[h] = i; });

// ═══════════════════════════════════════════════════════════════════════════════
//  2. MENU
// ═══════════════════════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Autograder')
    .addItem('Initial Setup\u2026',             'showSetupDialog')
    .addSeparator()
    .addItem('Grade New Submissions',            'gradeNewRows')
    .addItem('Re-grade Selected Rows',           'gradeSelectedRows')
    .addItem('Re-grade All Rows\u2026',          'gradeAllRows')
    .addSeparator()
    .addItem('Grade & Email All New',            'gradeAndEmailAllNew')
    .addItem('Email Selected Rows',              'emailSelectedRows')
    .addSeparator()
    .addItem('Create Submission Form',           'createSubmissionForm')
    .addItem('Test API Connection',              'testAPIConnection')
    .addSeparator()
    .addItem('Help / Setup Guide',               'showHelp')
    .addToUi();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  3. SETUP WIZARD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Shows the HTML dialog for picking periods and creating sheets.
 */
function showSetupDialog() {
  var ss = SpreadsheetApp.getActive();
  var existing = [];
  for (var p = 1; p <= MAX_PERIODS; p++) {
    if (ss.getSheetByName(GRADE_VIEW_PREFIX + p)) existing.push(p);
  }

  var html = HtmlService.createHtmlOutput(buildSetupHtml_(existing))
    .setWidth(460)
    .setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html, 'Game Lab Autograder — Initial Setup');
}

function buildSetupHtml_(existingPeriods) {
  var checkboxes = '';
  for (var p = 1; p <= MAX_PERIODS; p++) {
    var exists = existingPeriods.indexOf(p) >= 0;
    var disabled = exists ? ' disabled' : '';
    var checked  = exists ? ' checked' : '';
    var label    = exists ? 'Period ' + p + ' \u2713' : 'Period ' + p;
    var style    = exists ? 'color:#888;' : '';
    checkboxes +=
      '<label style="margin:4px 0;' + style + '">' +
      '<input type="checkbox" value="' + p + '"' + disabled + checked + '> ' + label +
      '</label>';
  }

  return '' +
    '<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.5;">' +
    '<p style="margin:0 0 12px 0;">Select class periods to create Grade View sheets for:</p>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px 0;margin:0 0 16px 4px;">' + checkboxes + '</div>' +
    '<p style="margin:0 0 8px 0;color:#666;font-size:11px;">' +
    'Periods with \u2713 already exist and will not be modified.</p>' +
    '<div style="display:flex;gap:8px;margin-top:12px;">' +
    '<button id="btnCreate" onclick="doCreate()" style="padding:8px 20px;font-size:13px;cursor:pointer;' +
    'background:#4285f4;color:#fff;border:none;border-radius:4px;">Create Sheets</button>' +
    '<button id="btnReset" onclick="doReset()" style="padding:8px 20px;font-size:13px;cursor:pointer;' +
    'background:#ea4335;color:#fff;border:none;border-radius:4px;">Reset Everything</button>' +
    '<button id="btnCancel" onclick="google.script.host.close()" style="padding:8px 20px;font-size:13px;' +
    'cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#fff;">Cancel</button>' +
    '</div>' +
    '<div id="status" style="margin-top:10px;color:#1a73e8;font-size:12px;min-height:18px;"></div>' +
    '</div>' +
    '<script>' +
    'function setWorking(msg){' +
    '  document.querySelectorAll("button").forEach(function(b){b.disabled=true;b.style.opacity="0.6";b.style.cursor="wait";});' +
    '  document.getElementById("status").textContent=msg||"Working\u2026";' +
    '}' +
    'function setReady(){' +
    '  document.querySelectorAll("button").forEach(function(b){b.disabled=false;b.style.opacity="1";b.style.cursor="pointer";});' +
    '  document.getElementById("status").textContent="";' +
    '}' +
    'function getChecked(){' +
    '  var cbs=document.querySelectorAll("input[type=checkbox]:checked:not(:disabled)");' +
    '  var arr=[];cbs.forEach(function(cb){arr.push(parseInt(cb.value));});return arr;' +
    '}' +
    'function doCreate(){' +
    '  var periods=getChecked();' +
    '  setWorking("\u23F3 Creating sheets\u2026 please wait.");' +
    '  google.script.run.withSuccessHandler(function(msg){' +
    '    alert(msg);google.script.host.close();' +
    '  }).withFailureHandler(function(e){' +
    '    setReady();alert("Error: "+e.message);' +
    '  }).createSheetsFromSetup(periods);' +
    '}' +
    'function doReset(){' +
    '  if(!confirm("' +
    '\u26A0\uFE0F  RESET EVERYTHING\\n\\n' +
    'This will permanently delete the following sheets and ALL their data:\\n\\n' +
    '  \u2022 Submissions (all grades, feedback, and status)\\n' +
    '  \u2022 Criteria\\n' +
    '  \u2022 All Grade View P# sheets\\n\\n' +
    'The following will NOT be affected:\\n\\n' +
    '  \u2022 Form Responses 1 (your raw form data stays intact)\\n' +
    '  \u2022 Your Apps Script code and API keys\\n\\n' +
    'You will need to re-run Initial Setup and re-import your Criteria CSV afterward.\\n\\n' +
    'Are you sure you want to delete everything?"))return;' +
    '  setWorking("\u23F3 Resetting\u2026 please wait.");' +
    '  google.script.run.withSuccessHandler(function(){' +
    '    alert("All autograder sheets deleted. Re-opening setup...");' +
    '    google.script.host.close();' +
    '    google.script.run.showSetupDialog();' +
    '  }).withFailureHandler(function(e){' +
    '    setReady();alert("Error: "+e.message);' +
    '  }).resetEverything();' +
    '}' +
    '</script>';
}

/**
 * Called from the setup dialog. Creates Submissions, Criteria (if missing)
 * and any new Grade View P# sheets for the selected periods.
 */
function createSheetsFromSetup(newPeriods) {
  var ss = SpreadsheetApp.getActive();

  // --- Submissions ---
  var sub = ss.getSheetByName(SHEET_SUB);
  if (!sub) {
    sub = ss.insertSheet(SHEET_SUB);
    sub.clear();
    sub.getRange(1, 1, 1, SUB_HEADERS.length).setValues([SUB_HEADERS]).setFontWeight('bold');
    sub.setFrozenRows(1);
  }

  // --- Criteria ---
  var crit = ss.getSheetByName(SHEET_CRIT);
  if (!crit) {
    crit = ss.insertSheet(SHEET_CRIT);
    crit.clear();
    var critHeaders = ['LevelID', 'CriterionID', 'Points', 'Type', 'Description'];
    crit.getRange(1, 1, 1, critHeaders.length).setValues([critHeaders]).setFontWeight('bold');
    crit.setFrozenRows(1);
  }

  // --- Grade View sheets ---
  var createdCount = 0;
  if (newPeriods && newPeriods.length) {
    newPeriods.forEach(function(p) {
      var name = GRADE_VIEW_PREFIX + p;
      if (ss.getSheetByName(name)) return; // already exists
      var gv = ss.insertSheet(name);
      gv.clear();
      gv.getRange(1, 1, 1, GRADE_VIEW_HEADERS.length)
        .setValues([GRADE_VIEW_HEADERS])
        .setFontWeight('bold');
      gv.setFrozenRows(1);

      // Array formula that filters+sorts from Submissions
      var formula = buildGradeViewFormula_(p);
      gv.getRange(2, 1).setFormula(formula);

      // Protect the sheet
      var protection = gv.protect().setDescription('Auto-generated grade view — do not edit');
      protection.setWarningOnly(true);

      // Grade View column widths
      setColumnWidths_(gv, {
        LevelID: 180, First: 120, Last: 120, Score: 55, MaxScore: 75,
        Status: 80, Email: 180, ShareURL: 160, Timestamp: 140, Notes: 300
      });

      // Alternate row shading by LevelID group (dynamic — updates as data arrives)
      applyLevelGroupBanding_(gv);

      createdCount++;
    });
  }

  // --- Clean up leftover junk sheets ---
  ['_autograder_reset_temp_', 'Sheet1'].forEach(function(name) {
    var junk = ss.getSheetByName(name);
    if (junk && ss.getSheets().length > 1) {
      try { ss.deleteSheet(junk); } catch (_) {}
    }
  });

  // --- Conditional formatting on Submissions Status column ---
  applyStatusFormatting_(sub);

  // --- Seed GEMINI_API_KEY script property so it appears in the UI ---
  seedApiKeyProperty_();

  // --- Set column widths ---
  setColumnWidths_(sub, {
    Timestamp: 140, First: 120, Last: 120, Period: 60, Email: 180,
    LevelID: 180, ShareURL: 160, ChannelID: 100,
    Score: 55, MaxScore: 75, Status: 80, Notes: 300, EmailedAt: 140
  });
  // Criteria — auto-resize is fine for the rubric descriptions
  if (crit) {
    var critCols = crit.getLastColumn();
    for (var c = 1; c <= critCols; c++) crit.autoResizeColumn(c);
  }

  var critCount = crit ? Math.max(crit.getLastRow() - 1, 0) : 0;

  var msg = 'Setup complete!\n\n';
  msg += '\u2022 Submissions sheet: ready\n';
  msg += '\u2022 Criteria: ' + critCount + ' rubric row(s)\n';
  if (createdCount) msg += '\u2022 Created ' + createdCount + ' new Grade View sheet(s)\n';
  msg += '\nNext steps:\n';
  if (!critCount) {
    msg += '1. Import a criteria CSV into the Criteria sheet:\n';
    msg += '   File \u2192 Import \u2192 Upload \u2192 pick your CSV \u2192 "Replace current sheet"\n';
    msg += '2. Add your API key:\n';
    msg += '   Extensions \u2192 Apps Script \u2192 \u2699\uFE0F Project Settings (gear icon)\n';
    msg += '   Scroll to Script Properties \u2192 find GEMINI_API_KEY \u2192 paste your key as the Value\n';
    msg += '   (Get a free key at aistudio.google.com)\n';
    msg += '3. Use "Test API Connection" from the Autograder menu to verify\n';
  } else {
    msg += '1. Add your API key:\n';
    msg += '   Extensions \u2192 Apps Script \u2192 \u2699\uFE0F Project Settings (gear icon)\n';
    msg += '   Scroll to Script Properties \u2192 find GEMINI_API_KEY \u2192 paste your key as the Value\n';
    msg += '   (Get a free key at aistudio.google.com)\n';
    msg += '2. Use "Test API Connection" from the Autograder menu to verify\n';
  }
  msg += '\nSee "Help / Setup Guide" for full instructions.';
  return msg;
}

/**
 * Builds the SORT(FILTER(...)) formula for a Grade View sheet.
 * Submissions columns (1-indexed): A=Timestamp B=First C=Last D=Period E=Email
 *   F=LevelID G=ShareURL H=ChannelID I=Score J=MaxScore K=Status L=Notes M=EmailedAt
 *
 * Grade View order: LevelID, First, Last, Score, MaxScore, Status, Email, ShareURL, Timestamp, Notes
 */
function buildGradeViewFormula_(periodNum) {
  // We use curly-brace array notation to reorder columns:
  // {F,B,C,I,J,K,E,G,A,L} filtered where D = periodNum, sorted by col1 (LevelID) then col3 (Last)
  // REGEXEXTRACT handles both numeric (7) and text ("Period 7") values in column D
  return '=IFERROR(SORT(FILTER({' +
    'Submissions!F:F,' +   // LevelID  → col 1
    'Submissions!B:B,' +   // First    → col 2
    'Submissions!C:C,' +   // Last     → col 3
    'Submissions!I:I,' +   // Score    → col 4
    'Submissions!J:J,' +   // MaxScore → col 5
    'Submissions!K:K,' +   // Status   → col 6
    'Submissions!E:E,' +   // Email    → col 7
    'Submissions!G:G,' +   // ShareURL → col 8
    'Submissions!A:A,' +   // Timestamp→ col 9
    'Submissions!L:L' +    // Notes    → col 10
    '},IFERROR(VALUE(REGEXEXTRACT(TO_TEXT(Submissions!D:D),"\\d+")),0)=' + periodNum +
    '),1,TRUE,3,TRUE),"")';
}

/**
 * Deletes all autograder sheets so the teacher can start fresh.
 */
function resetEverything() {
  var ss = SpreadsheetApp.getActive();
  var toDelete = [SHEET_SUB, SHEET_CRIT];
  for (var p = 1; p <= MAX_PERIODS; p++) toDelete.push(GRADE_VIEW_PREFIX + p);

  // Make sure there's always at least one sheet (Sheets requires it)
  var tempName = '_autograder_reset_temp_';
  var temp = ss.getSheetByName(tempName) || ss.insertSheet(tempName);

  toDelete.forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (sh) ss.deleteSheet(sh);
  });

  // Clear grade cache
  try { CacheService.getDocumentCache().removeAll([]); } catch(_) {}

  // The temp sheet is auto-deleted when Initial Setup runs next.
}

/**
 * Applies conditional formatting to the Status column (K) of Submissions.
 */
function applyStatusFormatting_(sh) {
  if (!sh) return;
  var statusCol = SC.Status + 1; // 1-indexed
  var range = sh.getRange(2, statusCol, sh.getMaxRows() - 1, 1);

  var rules = sh.getConditionalFormatRules();

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('OK')
    .setBackground('#d9ead3')
    .setRanges([range])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Error')
    .setBackground('#f4cccc')
    .setRanges([range])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('Invalid')
    .setBackground('#fce5cd')
    .setRanges([range])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('disabled')
    .setBackground('#fce5cd')
    .setRanges([range])
    .build());

  sh.setConditionalFormatRules(rules);
}

/**
 * Adds conditional formatting to a Grade View sheet so that rows alternate
 * background color by LevelID group. Uses COUNTUNIQUE($A$2:$A2) — because
 * column A is LevelID and the view is sorted by LevelID, each contiguous
 * block of the same level gets the same shade and the color flips when the
 * level changes. Fully formula-driven so it updates as new data arrives.
 */
function applyLevelGroupBanding_(gv) {
  if (!gv) return;
  var cols = gv.getMaxColumns() || 10;
  var range = gv.getRange(2, 1, gv.getMaxRows() - 1, cols);

  var rules = gv.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2<>"",ISEVEN(COUNTUNIQUE($A$2:$A2)))')
    .setBackground('#dbdbdb')
    .setRanges([range])
    .build());
  gv.setConditionalFormatRules(rules);
}


// ═══════════════════════════════════════════════════════════════════════════════
//  3b. FORM CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a Google Form linked to this spreadsheet, with the correct fields
 * for student submissions. Also installs the onFormSubmit trigger.
 *
 * The form collects: Email Address (built-in), First Name, Last Name,
 * Class Period (dropdown), Assessment Level (dropdown from Criteria sheet),
 * and Share URL.
 *
 * Safe to run multiple times — it will warn if a form is already linked.
 */
function createSubmissionForm() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActive();

  // Check if a form is already linked
  if (findFormResponsesSheet_()) {
    var resp = ui.alert(
      'Form Already Linked',
      'This spreadsheet already has a Form Responses sheet, which means a form is linked.\n\n' +
      'Do you want to create a new form anyway? (The old one will remain linked.)',
      ui.ButtonSet.YES_NO
    );
    if (resp !== ui.Button.YES) return;
  }

  // Collect unique LevelIDs from the Criteria sheet
  var crit = ss.getSheetByName(SHEET_CRIT);
  var levelIds = [];
  if (crit && crit.getLastRow() > 1) {
    var critData = crit.getDataRange().getValues();
    var critHead = headers_(critData[0]);
    if (critHead.LevelID !== undefined) {
      var seen = {};
      for (var i = 1; i < critData.length; i++) {
        var id = String(critData[i][critHead.LevelID] || '').trim();
        if (id && !seen[id]) { levelIds.push(id); seen[id] = true; }
      }
      levelIds.sort();
    }
  }
  if (!levelIds.length) {
    ui.alert(
      'No Assessment Levels Found',
      'The Criteria sheet has no LevelIDs. Please import a Criteria CSV first.',
      ui.ButtonSet.OK
    );
    return;
  }

  ss.toast('Creating submission form\u2026', 'Autograder', -1);

  // Build period choices from existing Grade View sheets
  var periods = [];
  for (var p = 1; p <= MAX_PERIODS; p++) {
    if (ss.getSheetByName(GRADE_VIEW_PREFIX + p)) periods.push(String(p));
  }
  if (!periods.length) {
    // Fallback: offer all 8 periods
    for (var p2 = 1; p2 <= MAX_PERIODS; p2++) periods.push(String(p2));
  }

  // Create the form
  var form = FormApp.create('Game Lab Autograder Submissions');
  form.setDescription(
    'Submit your Code.org Game Lab share link for grading.\n\n' +
    'Make sure you have clicked "Share" in Code.org and copied the URL before submitting.'
  );
  form.setCollectEmail(true);
  form.setLimitOneResponsePerUser(false);
  form.setAllowResponseEdits(false);

  // First Name
  form.addTextItem()
    .setTitle('First Name')
    .setRequired(true);

  // Last Name
  form.addTextItem()
    .setTitle('Last Name')
    .setRequired(true);

  // Class Period (dropdown)
  var periodItem = form.addListItem();
  periodItem.setTitle('Class Period');
  periodItem.setRequired(true);
  periodItem.setChoiceValues(periods);

  // Assessment Level (dropdown)
  var levelItem = form.addListItem();
  levelItem.setTitle('Assessment Level');
  levelItem.setRequired(true);
  levelItem.setChoiceValues(levelIds);

  // Share URL
  form.addTextItem()
    .setTitle('Share URL')
    .setHelpText('Paste your Code.org Game Lab share link (e.g., https://studio.code.org/projects/gamelab/abc123/)')
    .setRequired(true);

  // Link form responses to this spreadsheet
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // Install onFormSubmit trigger (if not already installed)
  var existingTriggers = ScriptApp.getProjectTriggers();
  var hasFormTrigger = existingTriggers.some(function(t) {
    return t.getHandlerFunction() === 'onFormSubmit' &&
           t.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT;
  });
  if (!hasFormTrigger) {
    ScriptApp.newTrigger('onFormSubmit')
      .forSpreadsheet(ss)
      .onFormSubmit()
      .create();
  }

  ss.toast('Form created!', 'Autograder', 3);

  var formUrl = form.getEditUrl();
  var publishedUrl = form.getPublishedUrl();
  ui.alert(
    'Form Created!',
    'Your submission form has been created and linked to this spreadsheet.\n\n' +
    '\u2705 Form responses will appear in a new "Form Responses" tab\n' +
    '\u2705 The onFormSubmit trigger has been installed\n\n' +
    'Student link (share this):\n' + publishedUrl + '\n\n' +
    'Edit form:\n' + formUrl + '\n\n' +
    'You can find the form in your Google Drive.',
    ui.ButtonSet.OK
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  4. GRADING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function gradeNewRows() {
  var ss = SpreadsheetApp.getActive();
  ss.toast('Checking for new submissions\u2026', 'Autograder', -1);

  // Step 1: Import any new form responses (if a form is linked)
  var importCount = importFormResponses_();

  // Step 2: Find all ungraded rows
  var sh = getSheet_(SHEET_SUB);
  var data = sh.getDataRange().getValues();
  var head = headers_(data[0]);
  var targets = [];
  for (var r = 1; r < data.length; r++) {
    var score = data[r][head.Score];
    var url   = data[r][head.ShareURL];
    var lvl   = data[r][head.LevelID];
    if (url && lvl && (score === '' || score === null || score === undefined)) {
      targets.push(r + 1);
    }
  }

  if (!targets.length && !importCount) {
    ss.toast('', 'Autograder', 1);
    SpreadsheetApp.getUi().alert('No new submissions found.\n\nAll rows with a LevelID and ShareURL already have a Score.');
    return;
  }

  // Step 3: Grade them
  if (targets.length) gradeRows_(targets);

  ss.toast('', 'Autograder', 1);
  var msg = 'Done!\n\n';
  if (importCount) msg += '\u2022 Imported ' + importCount + ' new form response(s)\n';
  msg += '\u2022 Graded ' + targets.length + ' submission(s)';
  SpreadsheetApp.getUi().alert(msg);
}

function gradeSelectedRows() {
  var ss = SpreadsheetApp.getActive();
  var sh = getSheet_(SHEET_SUB);
  if (ss.getActiveSheet().getName() !== SHEET_SUB) {
    SpreadsheetApp.getUi().alert('Please switch to the Submissions sheet and select the rows you want to re-grade.');
    return;
  }
  var sel = sh.getActiveRange();
  if (!sel) {
    SpreadsheetApp.getUi().alert('Please select one or more rows in the Submissions sheet first.');
    return;
  }
  var rows = [];
  for (var r = sel.getRow(); r < sel.getRow() + sel.getNumRows(); r++) {
    if (r >= 2) rows.push(r); // skip header
  }
  if (!rows.length) {
    SpreadsheetApp.getUi().alert('No data rows selected (row 1 is the header).');
    return;
  }
  ss.toast('Re-grading ' + rows.length + ' row(s)\u2026', 'Autograder', -1);
  gradeRows_(rows);
  ss.toast('', 'Autograder', 1);
  SpreadsheetApp.getUi().alert('Graded ' + rows.length + ' row(s).');
}

function gradeAllRows() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActive();
  var res = ui.alert(
    'Re-grade ALL rows?',
    'This will re-grade every submission. It can be slow and may use significant API credits.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  var sh = getSheet_(SHEET_SUB);
  var last = sh.getLastRow();
  var rows = [];
  for (var r = 2; r <= last; r++) rows.push(r);
  if (!rows.length) {
    ui.alert('No submissions to grade.');
    return;
  }
  ss.toast('Re-grading ' + rows.length + ' row(s)\u2026', 'Autograder', -1);
  gradeRows_(rows);
  ss.toast('', 'Autograder', 1);
  ui.alert('Re-graded ' + rows.length + ' submission(s).');
}

/**
 * Core grading loop. Grades the specified row numbers (1-indexed) in Submissions.
 */
function gradeRows_(rowNums) {
  if (!rowNums || !rowNums.length) return;

  var sh = getSheet_(SHEET_SUB);
  var data = sh.getDataRange().getValues();
  var head = headers_(data[0]);
  var critByLevel = loadCriteriaByLevel_();
  var total = rowNums.length;

  rowNums.forEach(function(rowNum, idx) {
    // Progress toast
    SpreadsheetApp.getActive().toast(
      'Grading row ' + (idx + 1) + ' of ' + total + '\u2026',
      'Autograder', 3
    );

    try {
      var r = rowNum - 1;
      if (r < 0 || r >= data.length) return;

      var url     = String(data[r][head.ShareURL] || '').trim();
      var levelId = String(data[r][head.LevelID]  || '').trim();

      if (!url || !levelId) {
        writeRow_(sh, rowNum, head, { Status: 'No URL/LevelID', Score: 0, Notes: '' });
        return;
      }

      var crits = critByLevel[levelId] || [];
      var maxPts = crits.reduce(function(s, c) { return s + (Number(c.Points) || 0); }, 0);
      if (!crits.length) {
        writeRow_(sh, rowNum, head, { Status: 'No criteria found', Score: 0, MaxScore: 0, Notes: '' });
        return;
      }

      var channelId = extractChannelId_(url);
      if (!channelId) {
        writeRow_(sh, rowNum, head, {
          ChannelID: '', Score: 0, MaxScore: maxPts,
          Status: 'Invalid share link (no ChannelID)',
          Notes: 'Expected a studio.code.org/projects/gamelab/<id> share URL'
        });
        return;
      }

      var fetched = fetchGameLabSource_(channelId);
      if (!fetched || !fetched.ok) {
        writeRow_(sh, rowNum, head, {
          ChannelID: channelId, Score: 0, MaxScore: maxPts,
          Status: 'Invalid share link or unreadable project',
          Notes: (fetched && fetched.msg) ? fetched.msg : 'Fetch failed'
        });
        return;
      }

      // Check cache (key includes criteria so edits to descriptions/points bust the cache)
      var critFingerprint = crits.map(function(c) {
        return c.CriterionID + ':' + c.Points + ':' + c.Description;
      }).join('\n');
      var cacheKey = 'grade:' + sha256_(levelId + '|' + critFingerprint + '|' + fetched.src);
      var cached = getGradeCache_(cacheKey);
      if (cached) {
        try {
          var cachedResult = JSON.parse(cached);
          writeRow_(sh, rowNum, head, {
            ChannelID: channelId,
            Score: cachedResult.score,
            MaxScore: cachedResult.max,
            Status: 'OK',
            Notes: cachedResult.notes.join(' | ')
          });
          return;
        } catch (_) { /* cache corrupt; re-grade */ }
      }

      // Grade via LLM
      var res = runCriteria_(fetched.src, crits, levelId);
      var patch = {
        ChannelID: channelId,
        Score: res.score,
        MaxScore: res.max,
        Status: 'OK',
        Notes: res.notes.join(' | ')
      };

      writeRow_(sh, rowNum, head, patch);

      // Cache the result (6-hour TTL = 21600 seconds)
      setGradeCache_(cacheKey, JSON.stringify({ score: res.score, max: res.max, notes: res.notes }));

    } catch (e) {
      writeRow_(sh, rowNum, head, { Status: 'Error', Notes: String(e) });
    }
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
//  5. LLM ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Runs all criteria against the given source code via LLM.
 * Returns { score, max, notes[] }.
 */
function runCriteria_(src, crits, levelIdOpt) {
  var total = crits.reduce(function(s, c) { return s + (Number(c.Points) || 0); }, 0);

  var levelId = levelIdOpt || (crits[0] && crits[0].LevelID) || '';
  var res = llmGrade_(levelId, src, crits);
  var byId = res.byId || {};
  var got = 0, notes = [];

  crits.forEach(function(c, i) {
    var id  = String(c.CriterionID || ('C' + i));
    var pts = Number(c.Points) || 0;
    var r   = byId[id] || { pass: false, reason: '' };
    if (r.pass) got += pts;
    notes.push((r.pass ? '\u2705 ' : '\u274C ') + (c.Description || id) + (r.pass ? '' : (r.reason ? ' \u2014 ' + r.reason : '')));
  });

  return { score: got, max: total, notes: notes };
}

function buildRubricPrompt_(levelId, src, llmCrits) {
  var checks = llmCrits.map(function(c, i) {
    return {
      id: String(c.CriterionID || ('C' + i)),
      description: String(c.Description || '').trim(),
      points: Number(c.Points) || 0
    };
  });

  var system =
    'You are a strict, consistent autograder for Code.org Game Lab (p5.js-style JavaScript). ' +
    'Given student code and rubric checks, decide PASS/FAIL for each check. ' +
    'If the code is empty/unreadable, mark all FAIL and set unreadable=true. ' +
    'Output JSON only.';

  var scoringRules = [
    'Treat code order as draw order: later shapes appear on top.',
    'rect(x,y) or rect(x,y,w,h) are both valid.',
    'Color can be literal ("purple") or a variable assigned that literal.',
    'Whitespace, comments, and semicolons are irrelevant.',
    'If unsure, mark FAIL (false).'
  ].join('\n- ');

  var user =
    'LEVEL: ' + levelId + '\n' +
    'SCORING RULES:\n- ' + scoringRules + '\n\n' +
    'Return ONLY JSON with this shape: {"unreadable":boolean,"checks":[{"id":string,"pass":boolean,"reason":string}]}.\n' +
    'CHECKS (IDs and descriptions):\n' +
    checks.map(function(x) { return '- ' + x.id + ': ' + x.description + ' (points ' + x.points + ')'; }).join('\n') +
    '\n\nCODE (fenced):\n```javascript\n' + (src || '') + '\n```';

  return { system: system, user: user, expectedIds: checks.map(function(x) { return x.id; }) };
}

function llmGrade_(levelId, src, llmCrits) {
  var provider = getLLMProvider_();
  if (provider === 'openai') return openaiGrade_(levelId, src, llmCrits);
  return geminiGrade_(levelId, src, llmCrits);
}

// ── Gemini ──

function geminiGrade_(levelId, src, llmCrits) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Missing GEMINI_API_KEY in Script properties');

  var built = buildRubricPrompt_(levelId, src, llmCrits);
  var expectedIds = built.expectedIds;
  var model = getDefaultModel_();

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);

  var body = {
    contents: [{ role: 'user', parts: [{ text: built.system + '\n\n' + built.user }] }],
    generationConfig: { temperature: 0, topP: 1 }
  };

  var resp = fetchWithRetry_(url, {
    method: 'post', contentType: 'application/json',
    muteHttpExceptions: true, payload: JSON.stringify(body)
  });

  var code = resp.getResponseCode();
  var txt  = resp.getContentText();
  if (code >= 400) throw new Error('Gemini HTTP ' + code + ': ' + txt.substring(0, 300));

  var outText = extractGeminiText_(txt);
  var parsed  = normalizeAutogradeJson_(outText, expectedIds);

  var byId = {};
  (parsed.checks || []).forEach(function(ch) {
    byId[String(ch.id)] = { pass: !!ch.pass, reason: ch.reason || '' };
  });
  return { byId: byId, raw: parsed, provider: 'gemini', model: model };
}

function extractGeminiText_(txt) {
  var obj; try { obj = JSON.parse(txt); } catch (e) { return ''; }
  var c = obj && obj.candidates && obj.candidates[0];
  var parts = c && c.content && c.content.parts;
  if (parts && parts.length) {
    return parts.map(function(p) { return p.text || ''; }).join('');
  }
  return (obj && obj.text) ? String(obj.text) : '';
}

// ── OpenAI ──

function openaiGrade_(levelId, src, llmCrits) {
  var key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!key) throw new Error('Missing OPENAI_API_KEY in Script properties');

  var built = buildRubricPrompt_(levelId, src, llmCrits);
  var expectedIds = built.expectedIds;

  var schema = {
    name: 'autograde_result',
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        unreadable: { type: 'boolean' },
        checks: {
          type: 'array', items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'pass'],
            properties: { id: { type: 'string' }, pass: { type: 'boolean' }, reason: { type: 'string' } }
          }
        }
      },
      required: ['checks']
    },
    strict: true
  };

  var model  = getDefaultModel_();
  var result = callResponsesStructured_(model, key, built.system, built.user, schema);
  var parsed = normalizeAutogradeJson_(result.text, expectedIds);

  var byId = {};
  (parsed.checks || []).forEach(function(ch) {
    byId[String(ch.id)] = { pass: !!ch.pass, reason: ch.reason || '' };
  });
  return { byId: byId, raw: parsed, provider: 'openai', model: model };
}

function extractResponsesText_(txt) {
  var obj; try { obj = JSON.parse(txt); } catch (e) { return ''; }
  return (
    (obj && obj.output_text) ||
    (obj && obj.output && obj.output[0] && obj.output[0].content &&
     obj.output[0].content[0] && obj.output[0].content[0].text) ||
    (obj && obj.choices && obj.choices[0] && obj.choices[0].message &&
     obj.choices[0].message.content) ||
    ''
  );
}

/**
 * Robust OpenAI Responses API call with 3-tier fallback:
 *   json_schema → json_object → plain "ONLY JSON"
 */
function callResponsesStructured_(model, key, system, user, schema) {
  function fetchBody(body) {
    return fetchWithRetry_('https://api.openai.com/v1/responses', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + key },
      payload: JSON.stringify(body)
    });
  }

  var base = {
    model: model,
    input: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0, top_p: 1
  };

  // Attempt 1: json_schema
  var b1 = JSON.parse(JSON.stringify(base));
  b1.response_format = { type: 'json_schema', json_schema: schema };
  var resp1 = fetchBody(b1);
  if (resp1.getResponseCode() < 400) {
    var t1 = extractResponsesText_(resp1.getContentText());
    try { JSON.parse(t1); return { code: resp1.getResponseCode(), text: t1, usedModel: model }; } catch (_) {}
  }

  // Attempt 2: json_object
  var b2 = JSON.parse(JSON.stringify(base));
  b2.response_format = { type: 'json_object' };
  b2.input[1].content = user + '\n\nReturn a JSON object with this exact shape: ' +
    '{"unreadable":boolean,"checks":[{"id":string,"pass":boolean,"reason":string}]}';
  var resp2 = fetchBody(b2);
  if (resp2.getResponseCode() < 400) {
    var t2 = extractResponsesText_(resp2.getContentText());
    try { JSON.parse(t2); return { code: resp2.getResponseCode(), text: t2, usedModel: model }; } catch (_) {}
  }

  // Attempt 3: plain
  var b3 = JSON.parse(JSON.stringify(base));
  b3.input[1].content = user + '\n\nReturn ONLY JSON, no prose.';
  var resp3 = fetchBody(b3);
  var t3 = extractResponsesText_(resp3.getContentText());
  return { code: resp3.getResponseCode(), text: t3, usedModel: model };
}


// ═══════════════════════════════════════════════════════════════════════════════
//  6. CODE.ORG FETCH
// ═══════════════════════════════════════════════════════════════════════════════

function extractChannelId_(url) {
  var m = String(url).match(/https?:\/\/studio\.code\.org\/projects\/gamelab\/([A-Za-z0-9\-_]+)/i);
  return m ? m[1] : '';
}

function fetchGameLabSource_(channelId) {
  var u = 'https://studio.code.org/v3/sources/' + encodeURIComponent(channelId) + '/main.json';
  var res = UrlFetchApp.fetch(u, { muteHttpExceptions: true });
  var code = res.getResponseCode(), body = res.getContentText();
  if (code >= 400) return { ok: false, src: '', msg: 'HTTP ' + code + ' from Code.org' };
  try {
    var parsed = JSON.parse(body);
    var src = (typeof parsed === 'string') ? parsed :
              (parsed && (parsed.source || parsed.code)) ? (parsed.source || parsed.code) : '';
    if (!src || src.trim().length < 10) return { ok: false, src: '', msg: 'Empty or too-short source' };
    return { ok: true, src: src, msg: 'OK' };
  } catch (e) {
    return { ok: false, src: '', msg: 'Non-JSON response (likely invalid share link)' };
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  7. EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

function emailSelectedRows() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_SUB);
  if (!sh) { SpreadsheetApp.getUi().alert('Submissions sheet not found. Run Initial Setup first.'); return; }
  if (ss.getActiveSheet().getName() !== SHEET_SUB) {
    SpreadsheetApp.getUi().alert('Please switch to the Submissions sheet and select the rows you want to email.');
    return;
  }
  var sel = sh.getActiveRange();
  if (!sel) { SpreadsheetApp.getUi().alert('Please select rows in the Submissions sheet.'); return; }
  ss.toast('Sending emails\u2026', 'Autograder', -1);
  var count = 0;
  for (var r = sel.getRow(); r < sel.getRow() + sel.getNumRows(); r++) {
    if (r >= 2 && sendEmailForRow_(r, true)) count++;
  }
  ss.toast('', 'Autograder', 1);
  SpreadsheetApp.getUi().alert('Sent ' + count + ' email(s).');
}

/**
 * Sends a results email for a single row. Returns true if sent, false if skipped.
 * When force=true (used by Email Selected Rows), re-sends even if already emailed
 * and sends even if Status is "Error". When force is falsy (automatic flows like
 * onFormSubmit and Grade & Email All New), skips already-emailed rows and Error rows.
 */
function sendEmailForRow_(rowNum, force) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SUB);
  if (!sh) return false;
  var data = sh.getDataRange().getValues();
  var head = headers_(data[0]);

  if (head.Email === undefined) return false;
  if (head.EmailedAt === undefined) return false;

  var row   = sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0];
  var email = String(row[head.Email] || '').trim();
  if (!email) return false;
  if (!force && row[head.EmailedAt]) return false; // already emailed (force bypasses this)

  // Don't email students about internal errors (429, timeouts, etc.)
  var status = String(row[head.Status] || '').trim();
  if (!force && status === 'Error') return false;

  var first  = row[head.First] || '';
  var last   = row[head.Last]  || '';
  var level  = row[head.LevelID] || '';
  var url    = row[head.ShareURL] || '';
  var score  = row[head.Score]    || 0;
  var max    = row[head.MaxScore] || 0;
  var notes  = String(row[head.Notes] || '');
  var who    = [first, last].filter(Boolean).join(' ').trim() || 'Student';

  var subject = '[Autograder] ' + level + ' \u2014 ' + score + '/' + max + (who ? (' \u2014 ' + who) : '');
  var items   = notes ? notes.split(' | ') : [];
  var htmlNotes = items.length
    ? '<ul>' + items.map(function(x) { return '<li>' + esc_(x) + '</li>'; }).join('') + '</ul>'
    : '<em>No detailed notes.</em>';
  var statusMsg = (status === 'OK')
    ? 'Your submission was graded automatically.'
    : 'Your submission could not be fully graded: <strong>' + esc_(status) + '</strong>.';

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">' +
    '<p>Hi ' + esc_(who) + ',</p>' +
    '<p>' + statusMsg + '</p>' +
    '<p><strong>Level:</strong> ' + esc_(level) + '<br>' +
    '<strong>Score:</strong> ' + esc_(score + '/' + max) + '<br>' +
    (url ? '<strong>Link:</strong> <a href="' + esc_(url) + '">your project</a>' : '') +
    '</p>' +
    '<p><strong>Checks:</strong></p>' + htmlNotes +
    '<p style="color:#666;">This email was generated by the class autograder.</p>' +
    '</div>';

  var text =
    'Hi ' + who + ',\n\n' +
    ((status === 'OK') ? 'Your submission was graded automatically.\n' : 'Your submission could not be fully graded: ' + status + '\n') +
    '\nLevel: ' + level +
    '\nScore: ' + score + '/' + max +
    (url ? '\nLink: ' + url : '') +
    '\n\nChecks:\n- ' + (items.length ? items.join('\n- ') : 'No detailed notes.') +
    '\n\n(This email was generated by the class autograder.)';

  GmailApp.sendEmail(email, subject, text, { htmlBody: html });
  sh.getRange(rowNum, head.EmailedAt + 1).setValue(new Date());
  return true;
}


// ═══════════════════════════════════════════════════════════════════════════════
//  8. FORM INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Trigger function — set up as: From spreadsheet → On form submit.
 * Appends the response to Submissions, grades it, and emails.
 */
function onFormSubmit(e) {
  try {
    var subSh = getSheet_(SHEET_SUB);
    var subHeaders = subSh.getRange(1, 1, 1, subSh.getLastColumn()).getValues()[0];
    var subMap = headers_(subHeaders);

    // Source = the tab the Form writes to (e.g., "Form Responses 1")
    var srcSh = e.range.getSheet();
    var srcHeaders = srcSh.getRange(1, 1, 1, srcSh.getLastColumn()).getValues()[0];
    var srcMap = headersSmart_(srcHeaders);

    var values = (e.values && e.values.length === srcHeaders.length)
      ? e.values
      : srcSh.getRange(e.range.getRow(), 1, 1, srcSh.getLastColumn()).getValues()[0];

    function getField(name, fallback) {
      var idx = srcMap[name];
      return (idx !== undefined) ? values[idx] : (fallback || '');
    }

    var out = new Array(subHeaders.length).fill('');
    if (subMap.Timestamp !== undefined) out[subMap.Timestamp] = getField('Timestamp', new Date());
    if (subMap.Email     !== undefined) out[subMap.Email]     = getField('Email', '');
    if (subMap.First     !== undefined) out[subMap.First]     = getField('First', '');
    if (subMap.Last      !== undefined) out[subMap.Last]      = getField('Last', '');
    if (subMap.Period    !== undefined) out[subMap.Period]     = toNumber_(getField('Period', ''));
    if (subMap.LevelID   !== undefined) out[subMap.LevelID]   = getField('LevelID', '');
    if (subMap.ShareURL  !== undefined) out[subMap.ShareURL]  = getField('ShareURL', '');

    subSh.appendRow(out);
    var newRow = subSh.getLastRow();

    gradeRows_([newRow]);

    try { sendEmailForRow_(newRow); } catch (_) {}

  } catch (err) {
    Logger.log('onFormSubmit error: ' + err);
  }
}

// ── Sync (Backfill) ──

/**
 * Imports new form responses into Submissions (de-duplicated). No grading or emailing.
 * Returns the number of new rows imported. Returns 0 if no form responses sheet found.
 */
function importFormResponses_() {
  var ss = SpreadsheetApp.getActive();
  var subSh = ss.getSheetByName(SHEET_SUB);
  if (!subSh) return 0;
  var subHeaders = subSh.getRange(1, 1, 1, subSh.getLastColumn()).getValues()[0];
  var subMap = headers_(subHeaders);

  var srcSheets = findAllFormResponsesSheets_();
  if (!srcSheets.length) return 0;

  // Build dedup key set from Submissions.
  // Key = timestamp(minute)|email|levelid — minute granularity avoids false
  // mismatches caused by sub-second differences between e.values strings
  // (used by onFormSubmit) and Date objects returned by getValues().
  var existing = {};
  var subValues = subSh.getDataRange().getValues();
  for (var i = 1; i < subValues.length; i++) {
    var ts  = normalizeTimestamp_(subValues[i][subMap.Timestamp]);
    var em  = (subMap.Email !== undefined) ? String(subValues[i][subMap.Email] || '').trim().toLowerCase() : '';
    var lvl = (subMap.LevelID !== undefined) ? String(subValues[i][subMap.LevelID] || '').trim() : '';
    existing[[ts, em, lvl].join('|')] = true;
  }

  var count = 0;
  for (var s = 0; s < srcSheets.length; s++) {
    var srcSh = srcSheets[s];
    var srcValues = srcSh.getDataRange().getValues();
    if (srcValues.length <= 1) continue;
    var srcHead = srcValues[0];
    var srcMap = headersSmart_(srcHead);

    for (var r = 1; r < srcValues.length; r++) {
      var row = srcValues[r];
      var tsVal  = (srcMap.Timestamp !== undefined) ? row[srcMap.Timestamp] : new Date();
      var emVal  = (srcMap.Email     !== undefined) ? row[srcMap.Email]     : '';
      var first  = (srcMap.First     !== undefined) ? row[srcMap.First]     : '';
      var last   = (srcMap.Last      !== undefined) ? row[srcMap.Last]      : '';
      var period = (srcMap.Period    !== undefined) ? row[srcMap.Period]    : '';
      var level  = (srcMap.LevelID   !== undefined) ? row[srcMap.LevelID]  : '';
      var share  = (srcMap.ShareURL  !== undefined) ? row[srcMap.ShareURL] : '';

      var key = [
        normalizeTimestamp_(tsVal),
        String(emVal || '').trim().toLowerCase(),
        String(level || '').trim()
      ].join('|');
      if (existing[key]) continue;

      var out = new Array(subHeaders.length).fill('');
      if (subMap.Timestamp !== undefined) out[subMap.Timestamp] = tsVal || new Date();
      if (subMap.Email     !== undefined) out[subMap.Email]     = emVal;
      if (subMap.First     !== undefined) out[subMap.First]     = first;
      if (subMap.Last      !== undefined) out[subMap.Last]      = last;
      if (subMap.Period    !== undefined) out[subMap.Period]     = toNumber_(period);
      if (subMap.LevelID   !== undefined) out[subMap.LevelID]   = level;
      if (subMap.ShareURL  !== undefined) out[subMap.ShareURL]  = share;

      subSh.appendRow(out);
      count++;
      existing[key] = true;
    }
  }

  return count;
}

/**
 * One-click workflow: import form responses, grade all ungraded, email all un-emailed.
 */
function gradeAndEmailAllNew() {
  var ss = SpreadsheetApp.getActive();
  ss.toast('Syncing, grading & emailing\u2026', 'Autograder', -1);

  // Step 1: Import any new form responses
  var importCount = importFormResponses_();

  // Step 2: Grade all ungraded rows
  var sh = getSheet_(SHEET_SUB);
  var data = sh.getDataRange().getValues();
  var head = headers_(data[0]);
  var targets = [];
  for (var r = 1; r < data.length; r++) {
    var score = data[r][head.Score];
    var url   = data[r][head.ShareURL];
    var lvl   = data[r][head.LevelID];
    if (url && lvl && (score === '' || score === null || score === undefined)) {
      targets.push(r + 1);
    }
  }
  if (targets.length) gradeRows_(targets);

  // Step 3: Email all un-emailed OK rows
  data = sh.getDataRange().getValues();
  var emailCount = 0;
  for (var r = 1; r < data.length; r++) {
    var status  = String(data[r][head.Status] || '');
    var emailed = data[r][head.EmailedAt];
    var email   = String(data[r][head.Email] || '').trim();
    if (status === 'OK' && !emailed && email) {
      try { if (sendEmailForRow_(r + 1)) emailCount++; } catch (_) {}
    }
  }

  ss.toast('', 'Autograder', 1);
  var msg = 'Done!\n\n';
  if (importCount) msg += '\u2022 Imported ' + importCount + ' new form response(s)\n';
  msg += '\u2022 Graded ' + targets.length + ' submission(s)\n';
  msg += '\u2022 Emailed ' + emailCount + ' student(s)';
  SpreadsheetApp.getUi().alert(msg);
}


// ═══════════════════════════════════════════════════════════════════════════════
//  9. DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Combined API test: checks basic connectivity then structured JSON grading.
 */
function testAPIConnection() {
  var p = getLLMProvider_();
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  ss.toast('Testing API connection\u2026', 'Autograder', -1);

  var model = getDefaultModel_();
  var lines = [];
  var allOk = true;

  // --- Test 1: Basic connectivity ---
  try {
    var basicOk = false, basicText = '';
    if (p === 'openai') {
      var key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
      if (!key) throw new Error('OPENAI_API_KEY is not set.\n\nTo add it:\n1. Go to Extensions \u2192 Apps Script\n2. Click the \u2699\uFE0F gear icon (Project Settings)\n3. Scroll down to Script Properties\n4. Click "Add script property"\n5. Property: OPENAI_API_KEY   Value: your key');
      var resp = fetchWithRetry_('https://api.openai.com/v1/responses', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + key },
        payload: JSON.stringify({ model: model, input: [{ role: 'user', content: 'Reply with the single word: pong.' }] })
      });
      basicOk = resp.getResponseCode() < 400;
      basicText = basicOk ? extractResponsesText_(resp.getContentText()).substring(0, 80).trim() : ('HTTP ' + resp.getResponseCode());
    } else {
      var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
      if (!key) throw new Error('GEMINI_API_KEY is not set.\n\nTo add it:\n1. Go to Extensions \u2192 Apps Script\n2. Click the \u2699\uFE0F gear icon (Project Settings)\n3. Scroll down to Script Properties\n4. Find GEMINI_API_KEY and paste your key as the Value\n   (or click "Add script property" if it\u2019s not there)\n5. Get a free key at aistudio.google.com');
      var gUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
      var resp = fetchWithRetry_(gUrl, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: pong.' }] }], generationConfig: { temperature: 0, topP: 1 } })
      });
      basicOk = resp.getResponseCode() < 400;
      basicText = basicOk ? extractGeminiText_(resp.getContentText()).substring(0, 80).trim() : ('HTTP ' + resp.getResponseCode());
    }
    if (basicOk) lines.push('\u2705 Connection OK (' + basicText + ')');
    else { allOk = false; lines.push('\u274C Connection failed: ' + basicText); }
  } catch (e) {
    allOk = false; lines.push('\u274C ' + String(e));
  }

  // --- Test 2: Structured JSON grading (only if basic passed) ---
  if (allOk) {
    try {
      var checks = [
        { id: 'has_purple', description: 'Code sets fill("purple") before drawing a rectangle.' },
        { id: 'has_draw',   description: 'Code defines a draw() function.' }
      ];
      var checkIds = checks.map(function(c) { return c.id; });
      var system = 'You are a strict autograder. Decide PASS/FAIL per check. Output JSON only.';
      var user = 'Return ONLY JSON: {"unreadable":boolean,"checks":[{"id":string,"pass":boolean,"reason":string}]}\n\n' +
        'CHECKS:\n' + checks.map(function(c) { return '- ' + c.id + ': ' + c.description; }).join('\n') +
        '\n\nCODE:\n```javascript\nfill("purple"); rect(10,10,20,20);\n```';

      var structOk = false, numChecks = 0;
      if (p === 'openai') {
        var oaiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
        var schema = {
          name: 'autograde_result',
          schema: {
            type: 'object', additionalProperties: false,
            properties: {
              unreadable: { type: 'boolean' },
              checks: { type: 'array', items: { type: 'object', additionalProperties: false,
                required: ['id', 'pass'],
                properties: { id: { type: 'string' }, pass: { type: 'boolean' }, reason: { type: 'string' } }
              }}
            }, required: ['checks']
          }, strict: true
        };
        var result = callResponsesStructured_(model, oaiKey, system, user, schema);
        var parsed = normalizeAutogradeJson_(result.text, checkIds);
        structOk = parsed && Array.isArray(parsed.checks) && parsed.checks.length > 0;
        numChecks = structOk ? parsed.checks.length : 0;
      } else {
        var gemKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
        var gemUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(gemKey);
        var gResp = fetchWithRetry_(gemUrl, {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: system + '\n\n' + user }] }], generationConfig: { temperature: 0, topP: 1 } })
        });
        var gText = extractGeminiText_(gResp.getContentText());
        var parsed = normalizeAutogradeJson_(gText, checkIds);
        structOk = parsed && Array.isArray(parsed.checks) && parsed.checks.length > 0;
        numChecks = structOk ? parsed.checks.length : 0;
        Logger.log('Structured test raw:\n%s', gText);
      }
      if (structOk) lines.push('\u2705 Structured grading OK (' + numChecks + ' checks parsed)');
      else { allOk = false; lines.push('\u274C Structured grading: could not parse JSON response \u2014 see Logs'); }
    } catch (e) {
      allOk = false; lines.push('\u274C Structured grading: ' + String(e));
    }
  }

  ss.toast('', 'Autograder', 1);
  ui.alert(
    (allOk ? '\u2705 All tests passed!' : '\u274C Test failed') + '\n\n' +
    'Provider: ' + p + '\nModel: ' + model + '\n\n' +
    lines.join('\n')
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// 10. UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

// ── Sheet helpers ──

function getSheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: "' + name + '". Run Autograder \u2192 Initial Setup first.');
  return sh;
}

function headers_(row1) {
  var m = {};
  for (var i = 0; i < row1.length; i++) m[row1[i]] = i;
  return m;
}

function writeRow_(sh, rowNum, head, patch) {
  var row = sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0];
  Object.keys(patch).forEach(function(k) {
    if (head[k] !== undefined) row[head[k]] = patch[k];
  });
  sh.getRange(rowNum, 1, 1, row.length).setValues([row]);
}

/**
 * Sets column widths on a sheet by header name → pixel width map.
 */
function setColumnWidths_(sh, widthMap) {
  if (!sh) return;
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var c = 0; c < head.length; c++) {
    var name = String(head[c] || '').trim();
    if (widthMap[name]) sh.setColumnWidth(c + 1, widthMap[name]);
  }
}

// ── Criteria ──

function loadCriteriaByLevel_() {
  var sh = getSheet_(SHEET_CRIT);
  var values = sh.getDataRange().getValues();
  var head = headers_(values[0]);
  var map = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var levelId = String(row[head.LevelID] || '').trim();
    if (!levelId) continue;
    (map[levelId] = map[levelId] || []).push({
      LevelID:     levelId,
      CriterionID: row[head.CriterionID],
      Points:      row[head.Points],
      Type:        row[head.Type],
      Description: row[head.Description]
    });
  }
  return map;
}

// ── LLM config ──

function getLLMProvider_() {
  var p = PropertiesService.getScriptProperties().getProperty('LLM_PROVIDER');
  p = String(p || DEFAULT_PROVIDER).trim().toLowerCase();
  if (p !== 'openai' && p !== 'gemini') p = DEFAULT_PROVIDER;
  return p;
}

function getDefaultModel_() {
  return DEFAULT_MODEL_BY_PROVIDER[getLLMProvider_()] || DEFAULT_MODEL_BY_PROVIDER.gemini;
}

/**
 * Seeds the GEMINI_API_KEY script property with an empty value if it doesn't
 * already exist. This makes the property visible in the Apps Script UI so
 * teachers only need to paste in their key instead of also typing the name.
 */
function seedApiKeyProperty_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('GEMINI_API_KEY')) {
    props.setProperty('GEMINI_API_KEY', '');
  }
}

// ── Header mapping for form responses (verbose → short names) ──

function headersSmart_(row1) {
  var aliases = {
    Timestamp: ['Timestamp', 'Response Timestamp', 'Submitted at'],
    Email:     ['Email', 'Email Address', 'Email address'],
    First:     ['First', 'First Name', 'Given Name'],
    Last:      ['Last', 'Last Name', 'Family Name', 'Surname'],
    Period:    ['Period', 'Class Period', 'Class', 'Section'],
    LevelID:   ['LevelID', 'Level ID', 'Assessment Level',
                'Which assessment level',
                'Which assessment level are you submitting'],
    ShareURL:  ['ShareURL', 'Share URL', 'URL', 'Project URL', 'Project Link',
                'Paste the share URL', 'Paste the URL']
  };
  var map = {};
  for (var c = 0; c < row1.length; c++) {
    var h  = String(row1[c] || '').trim();
    var hl = h.toLowerCase();
    Object.keys(aliases).forEach(function(key) {
      if (map[key] !== undefined) return;
      aliases[key].some(function(alias) {
        if (hl === alias.toLowerCase() || hl.indexOf(alias.toLowerCase()) === 0) {
          map[key] = c;
          return true;
        }
        return false;
      });
    });
  }
  return map;
}

function findFormResponsesSheet_() {
  var sheets = findAllFormResponsesSheets_();
  return sheets.length ? sheets[0] : null;
}

function findAllFormResponsesSheets_() {
  var ss = SpreadsheetApp.getActive();
  var result = [];
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    if (/^Form Responses/i.test(all[i].getName())) result.push(all[i]);
  }
  return result;
}

function normalizeTimestamp_(v) {
  try {
    var tz = Session.getScriptTimeZone() || 'UTC';
    var d  = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v || '').trim();
    // Round to the nearest minute — sub-minute precision varies between
    // e.values strings and getValues() Date objects, causing false mismatches.
    d.setSeconds(0, 0);
    return Utilities.formatDate(d, tz, "yyyy-MM-dd'T'HH:mm");
  } catch (e) {
    return String(v || '').trim();
  }
}

// ── JSON normalization ──

function normalizeAutogradeJson_(text, expectedIds) {
  var out = { unreadable: false, checks: [] };
  text = stripCodeFences_(text);
  var obj;
  try { obj = JSON.parse(text); } catch (e) { return out; }

  if (obj && Array.isArray(obj.checks)) {
    out.unreadable = !!obj.unreadable;
    obj.checks.forEach(function(ch) {
      if (!ch) return;
      out.checks.push({ id: String(ch.id), pass: toBool_(ch.pass), reason: ch.reason ? String(ch.reason) : '' });
    });
    return out;
  }

  var source = (obj && typeof obj.results === 'object' && obj.results) ? obj.results : obj;
  var ids = expectedIds && expectedIds.length ? expectedIds : Object.keys(source || {});
  ids.forEach(function(id) {
    if (!source || !(id in source)) return;
    var v = source[id], pass = false, reason = '';
    if (v && typeof v === 'object') {
      if ('pass' in v) pass = toBool_(v.pass);
      else if ('result' in v) pass = toBool_(v.result);
      else if ('ok' in v) pass = toBool_(v.ok);
      if (v.reason) reason = String(v.reason);
    } else {
      pass = toBool_(v);
    }
    out.checks.push({ id: String(id), pass: pass, reason: reason });
  });
  return out;
}

function stripCodeFences_(s) {
  s = String(s || '').trim();
  if (s.substring(0, 3) === '```') s = s.replace(/^```[\w-]*\s*/i, '').replace(/\s*```$/, '');
  return s.trim();
}

function toBool_(v) {
  if (typeof v === 'boolean') return v;
  var s = String(v || '').trim().toLowerCase();
  return s === 'pass' || s === 'passed' || s === 'true' || s === 'yes' || s === 'y' || s === '1';
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  var s = String(v).trim();
  var n = Number(s);
  if (!isNaN(n)) return n;
  // Extract trailing number from strings like "Period 7"
  var m = s.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : v;
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ── HTTP fetch with retry (handles 429 rate limits) ──

/**
 * Wrapper around UrlFetchApp.fetch that retries on 429 (rate limit) and 503
 * with exponential backoff. Up to 4 retries (waits ~2s, ~4s, ~8s, ~16s).
 * Total max wait ≈ 30s, well within Apps Script's 6-minute execution limit.
 */
function fetchWithRetry_(url, options) {
  var MAX_RETRIES = 4;
  var baseDelay   = 2000; // 2 seconds

  for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    var resp = UrlFetchApp.fetch(url, options);
    var code = resp.getResponseCode();

    if (code !== 429 && code !== 503) return resp; // success or non-retryable error
    if (attempt === MAX_RETRIES) return resp;       // out of retries, return last response

    // Exponential backoff with jitter: 2s, 4s, 8s, 16s (±25%)
    var delay = baseDelay * Math.pow(2, attempt);
    var jitter = delay * 0.25 * (Math.random() - 0.5); // ±12.5%
    Utilities.sleep(Math.round(delay + jitter));
  }
  return resp; // shouldn't reach here, but just in case
}

// ── Cache helpers (CacheService, 6-hour TTL) ──

function getGradeCache_(key) {
  try { return CacheService.getDocumentCache().get(key); }
  catch (_) { return null; }
}

function setGradeCache_(key, value) {
  try { CacheService.getDocumentCache().put(key, value, 21600); } // 6 hours
  catch (_) {}
}

function sha256_(s) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  return raw.map(function(b) { var v = (b < 0 ? b + 256 : b); return ('0' + v.toString(16)).slice(-2); }).join('');
}


// ═══════════════════════════════════════════════════════════════════════════════
// 11. HELP DIALOG
// ═══════════════════════════════════════════════════════════════════════════════

function showHelp() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;max-width:500px;">' +

    '<h2 style="margin:0 0 8px 0;font-size:16px;">\uD83C\uDFAE Game Lab Autograder v2</h2>' +
    '<p style="margin:0 0 12px 0;color:#555;">Automatically grades Code.org Game Lab projects using AI.</p>' +

    '<h3 style="margin:12px 0 6px 0;font-size:14px;">\uD83D\uDE80 Getting Started</h3>' +
    '<ol style="margin:0 0 12px 18px;padding:0;">' +

    '<li><b>Run Initial Setup</b> from the Autograder menu. Check the periods you teach.</li>' +

    '<li><b>Import a criteria CSV</b> into the Criteria sheet:<br>' +
    'Go to the <b>Criteria</b> sheet \u2192 <b>File \u2192 Import \u2192 Upload</b> \u2192 pick your CSV<br>' +
    'Set Import location to <b>"Replace current sheet"</b> \u2192 click <b>Import data</b></li>' +

    '<li><b>Set your API key:</b><br>' +
    'Go to <b>Extensions \u2192 Apps Script</b> \u2192 click the <b>\u2699\uFE0F gear icon</b> (Project Settings)<br>' +
    'Scroll down to <b>Script Properties</b> \u2192 find <code>GEMINI_API_KEY</code> \u2192 paste your key as the <b>Value</b><br>' +
    '<span style="color:#666;">Get a free key at <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a></span><br>' +
    '<span style="color:#666;">\uD83C\uDFA5 <a href="https://www.youtube.com/watch?v=qMyOoAe9DS4" target="_blank">Watch a 1-minute video walkthrough</a></span><br>' +
    '<span style="color:#666;">(Optional: set <code>LLM_PROVIDER</code> = <code>openai</code> and add <code>OPENAI_API_KEY</code>)</span></li>' +

    '<li><b>Test your connection:</b> Use <b>Test API Connection</b> from the Autograder menu.</li>' +

    '<li><b>Create and link a Google Form:</b><br>' +
    'Run <b>Autograder \u2192 Create Submission Form</b> from the menu.<br>' +
    'This automatically creates a properly configured form, links it to this spreadsheet, and installs the auto-grade trigger.<br>' +
    '<span style="color:#666;font-size:12px;">Alternatively, you can create a form manually \u2014 see the README for field details.</span></li>' +


    '<li><b>Done!</b> When a student submits the form, their code is automatically graded and they receive an email with their score.</li>' +
    '</ol>' +

    '<h3 style="margin:12px 0 6px 0;font-size:14px;">\uD83D\uDCCB Menu Reference</h3>' +
    '<ul style="margin:0 0 12px 18px;padding:0;">' +
    '<li><b>Initial Setup\u2026</b> \u2014 creates Submissions, Criteria, and Grade View sheets. Use this the first time, or to add a new period mid-year. Won\u2019t overwrite sheets that already exist.' +
    '<br><span style="color:#666;font-size:12px;">\u2022 <em>Reset Everything</em> (inside the dialog) permanently deletes Submissions, Criteria, and all Grade View P# sheets. <b>Form Responses 1 is not affected.</b> Use this for a fresh start at the beginning of a new semester. You\u2019ll need to re-run Initial Setup and re-import your Criteria CSV afterward.</span></li>' +
    '<li><b>Grade New Submissions</b> \u2014 imports new form responses (if any), then grades all ungraded rows in Submissions</li>' +
    '<li><b>Re-grade Selected Rows</b> \u2014 re-grades the rows you highlight in Submissions (e.g., after editing criteria)</li>' +
    '<li><b>Re-grade All Rows</b> \u2014 re-grades every row in Submissions (slow, uses API credits)</li>' +
    '<li><b>Grade & Email All New</b> \u2014 imports, grades, and emails results in one step</li>' +
    '<li><b>Email Selected Rows</b> \u2014 sends result emails for rows you highlight in Submissions</li>' +
    '<li><b>Create Submission Form</b> \u2014 creates a Google Form with the correct fields, links it to this spreadsheet, and installs the auto-grade trigger</li>' +
    '<li><b>Test API Connection</b> \u2014 verifies your API key and structured JSON grading work</li>' +
    '</ul>' +

    '<h3 style="margin:12px 0 6px 0;font-size:14px;">\uD83D\uDCC4 Sheet Reference</h3>' +
    '<ul style="margin:0 0 12px 18px;padding:0;">' +
    '<li><b>Submissions</b> \u2014 all student submissions and grades (the main data sheet)</li>' +
    '<li><b>Grade View P#</b> \u2014 read-only views filtered by period, sorted by level then name</li>' +
    '<li><b>Criteria</b> \u2014 rubric criteria (imported from a CSV; you can edit descriptions/points directly)</li>' +
    '</ul>' +

    '</div>'
  ).setWidth(560).setHeight(620);

  SpreadsheetApp.getUi().showModalDialog(html, 'Autograder Help');
}
