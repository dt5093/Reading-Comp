// Reading Comp -> Google Sheet
//
// Paste this whole file into your Google Sheet's Apps Script editor
// (Extensions > Apps Script), set SECRET below, then Deploy as a Web app.
// Full steps are in the README under "Save grades to a Google Sheet".
//
// Every graded summary is added as a new row on a tab called "Grades".

// Make up a long random phrase and put the SAME value in Render as SHEETS_SECRET.
// It stops strangers from adding rows to your sheet.
const SECRET = 'PASTE-YOUR-SECRET-HERE';

const HEADERS = ['Submitted', 'Student', 'Story', 'Grade', 'Summary', 'Feedback to student', 'Strengths', 'Suggestions'];

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'Request was not valid JSON' });
  }
  if (SECRET === 'PASTE-YOUR-SECRET-HERE') {
    return reply({ ok: false, error: 'Set SECRET at the top of the Apps Script, then deploy a new version' });
  }
  if (data.secret !== SECRET) {
    return reply({ ok: false, error: 'Secret does not match. Check SHEETS_SECRET in Render and SECRET in the Apps Script' });
  }

  // Several students can submit at once; take turns writing.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getGradesSheet();
    sheet.appendRow([
      new Date(data.submittedAt || Date.now()),
      safe(data.student),
      safe(data.title),
      safe(data.grade),
      safe(data.summary),
      safe(data.feedback),
      safe((data.strengths || []).join('\n')),
      safe((data.improvements || []).join('\n')),
    ]);
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

function getGradesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Grades');
  if (!sheet) sheet = ss.insertSheet('Grades');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// Keep text as plain text: stop anything a student types (like "=...") from
// being treated as a spreadsheet formula, and keep grades like "4" as text.
function safe(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@0-9]/.test(text) ? "'" + text : text;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
