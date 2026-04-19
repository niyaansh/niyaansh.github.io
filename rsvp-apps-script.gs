// =====================================================================
// RSVP → Google Sheet + auto-updated Google Doc + email notifs
// Tracks Yes / Maybe / No, only counts YES toward totals.
// =====================================================================
// SETUP:
// 1. Create a Google Sheet. Extensions → Apps Script. Paste this file.
// 2. Create a blank Google Doc, share with HOST_EMAILS, paste its ID below.
// 3. EDIT HOST_EMAILS + GUEST_LIST_DOC_ID.
// 4. Deploy → New deployment → Web app (Execute as Me, Access Anyone).
// 5. Copy URL → paste into index.html RSVP_ENDPOINT.
// 6. Run testEmail() once to grant Gmail + Docs permissions.
//
// UPDATE later: Deploy → Manage deployments → ✏️ → New version → Deploy.
// =====================================================================

const HOST_EMAILS = 'dheeraj.46329@gmail.com, vattikonda.anusha@gmail.com, sainisanth92@gmail.com';
const GUEST_LIST_DOC_ID = 'PASTE_YOUR_GOOGLE_DOC_ID_HERE';
const EVENT_NAME = "Niyaansh's 1st Birthday";


function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    const sheetUrl = ss.getUrl();

    // Header row — now with Attending column
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Name', 'Email', 'Attending', 'Adults', 'Kids', 'Total', 'Comment', 'User Agent']);
      sheet.getRange('A1:I1').setFontWeight('bold').setBackground('#ffdca8');
      sheet.setFrozenRows(1);
    }

    const adults    = Number(data.adults) || 0;
    const kids      = Number(data.kids)   || 0;
    const total     = adults + kids;
    const email     = String(data.email || '').toLowerCase().trim();
    const attending = String(data.attending || 'yes').toLowerCase().trim();  // yes / maybe / no

    const row = [
      data.timestamp || new Date().toISOString(),
      data.name      || '',
      data.email     || '',
      attending,
      adults,
      kids,
      total,
      data.comment   || '',
      data.userAgent || ''
    ];

    // De-dupe: if this email exists, overwrite instead of appending
    let isUpdate = false;
    if (email && sheet.getLastRow() > 1) {
      const existingEmails = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < existingEmails.length; i++) {
        const existing = String(existingEmails[i][0] || '').toLowerCase().trim();
        if (existing === email) {
          sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
          isUpdate = true;
          break;
        }
      }
    }
    if (!isUpdate) {
      sheet.appendRow(row);
    }

    // Aggregate stats from the full sheet — ONLY count "yes" toward totals
    let yesGuests = 0;
    let yesCount = 0;
    let maybeCount = 0;
    let noCount = 0;
    const yesList = [];        // names of people coming (for the Doc)
    if (sheet.getLastRow() > 1) {
      const all = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
      all.forEach(r => {
        const name = String(r[1] || '').trim();
        const att  = String(r[3] || 'yes').toLowerCase().trim();
        const t    = Number(r[6]) || 0;
        if (att === 'yes') {
          yesGuests += t;
          yesCount += 1;
          if (name) yesList.push(name);
        } else if (att === 'maybe') {
          maybeCount += 1;
        } else if (att === 'no') {
          noCount += 1;
        }
      });
    }

    // Rewrite the Google Doc — ONLY names of YES attendees
    const docUrl = updateGuestListDoc(yesList);

    const linkUrl = docUrl || sheetUrl;
    const linkLabel = docUrl ? '📄 Open the Guest List doc' : '📊 Open the RSVP Sheet';

    if (HOST_EMAILS && HOST_EMAILS.trim()) {
      const attLabel = attending === 'yes' ? '🎉 New' :
                       attending === 'maybe' ? '🤔 Maybe' :
                       '❌ Declined';
      const subject = `${attLabel} RSVP: ${data.name || 'Someone'} — ${yesGuests} total so far`;

      const attBadge = attending === 'yes'   ? '<span style="color:#2e7d4f">✓ Yes</span>' :
                       attending === 'maybe' ? '<span style="color:#b06830">? Maybe</span>' :
                                               '<span style="color:#b63d3d">✕ No</span>';

      const plain =
        `${attLabel} RSVP for ${EVENT_NAME}\n\n` +
        `--- This submission ---\n` +
        `Name: ${data.name || '(blank)'}\n` +
        `Email: ${data.email || '(blank)'}\n` +
        `Attending: ${attending}\n` +
        `Adults: ${adults}\n` +
        `Kids: ${kids}\n` +
        `Total: ${total}\n` +
        (data.comment ? `Comment: ${data.comment}\n` : '') +
        `\n--- Running tally ---\n` +
        `${yesGuests} confirmed (from ${yesCount} Yes)\n` +
        `${maybeCount} Maybe, ${noCount} No\n\n` +
        `Guest list doc: ${linkUrl}`;

      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:540px;color:#222">
          <h2 style="color:#b06850;margin:0 0 4px">${attLabel} RSVP received</h2>
          <p style="color:#666;margin:0 0 24px">for ${EVENT_NAME}</p>

          <h3 style="margin:0 0 8px;color:#444;font-size:14px;text-transform:uppercase;letter-spacing:.05em">From this submission</h3>
          <table style="border-collapse:collapse;width:100%;margin-bottom:24px">
            <tr><td style="padding:8px 10px;background:#fff4e0;border:1px solid #eee;width:180px"><b>Name</b></td>
                <td style="padding:8px 10px;border:1px solid #eee">${escapeHtml(data.name || '')}</td></tr>
            <tr><td style="padding:8px 10px;background:#fff4e0;border:1px solid #eee"><b>Email</b></td>
                <td style="padding:8px 10px;border:1px solid #eee">${escapeHtml(data.email || '')}</td></tr>
            <tr><td style="padding:8px 10px;background:#fff4e0;border:1px solid #eee"><b>Attending</b></td>
                <td style="padding:8px 10px;border:1px solid #eee"><b>${attBadge}</b></td></tr>
            <tr><td style="padding:8px 10px;background:#fff4e0;border:1px solid #eee"><b>Adults</b></td>
                <td style="padding:8px 10px;border:1px solid #eee">${adults}</td></tr>
            <tr><td style="padding:8px 10px;background:#fff4e0;border:1px solid #eee"><b>Kids</b></td>
                <td style="padding:8px 10px;border:1px solid #eee">${kids}</td></tr>
            <tr><td style="padding:8px 10px;background:#fff4e0;border:1px solid #eee"><b>Total (this RSVP)</b></td>
                <td style="padding:8px 10px;border:1px solid #eee"><b>${total}</b></td></tr>
            ${data.comment ? `
            <tr><td style="padding:8px 10px;background:#fff4e0;border:1px solid #eee"><b>Comment</b></td>
                <td style="padding:8px 10px;border:1px solid #eee">${escapeHtml(data.comment)}</td></tr>
            ` : ''}
            <tr><td style="padding:10px;background:linear-gradient(135deg,#ffdca8,#ffb878);border:1px solid #eea060;color:#5a3510"><b>Confirmed so far</b></td>
                <td style="padding:10px;background:linear-gradient(135deg,#ffdca8,#ffb878);border:1px solid #eea060;color:#5a3510"><b style="font-size:17px">${yesGuests}</b> guests (${yesCount} Yes · ${maybeCount} Maybe · ${noCount} No)</td></tr>
          </table>

          <p style="margin-top:24px">
            <a href="${linkUrl}" style="display:inline-block;padding:12px 22px;background:#f08a3e;color:white;text-decoration:none;border-radius:999px;font-weight:600">
              ${linkLabel}
            </a>
          </p>

          <p style="color:#999;font-size:12px;margin-top:24px">
            Received ${new Date().toLocaleString()}
          </p>
        </div>`;

      MailApp.sendEmail({
        to: HOST_EMAILS,
        subject: subject,
        body: plain,
        htmlBody: html,
        name: 'Birthday RSVP'
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify({ok: true, updated: isUpdate, yesGuests: yesGuests}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ok: false, error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// Rewrites the Google Doc — just names of attendees who said YES
function updateGuestListDoc(yesNames) {
  if (!GUEST_LIST_DOC_ID || GUEST_LIST_DOC_ID === 'PASTE_YOUR_GOOGLE_DOC_ID_HERE') {
    return null;
  }
  try {
    const doc = DocumentApp.openById(GUEST_LIST_DOC_ID);
    const body = doc.getBody();
    body.clear();

    if (yesNames.length === 0) {
      body.appendParagraph('(no confirmed guests yet)').editAsText().setItalic(true);
    } else {
      yesNames.forEach(name => {
        body.appendListItem(name).setGlyphType(DocumentApp.GlyphType.BULLET);
      });
    }

    doc.saveAndClose();
    return doc.getUrl();
  } catch (err) {
    return null;
  }
}

function doGet() {
  return ContentService
    .createTextOutput('RSVP endpoint is alive ✅')
    .setMimeType(ContentService.MimeType.TEXT);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function testEmail() {
  MailApp.sendEmail({
    to: HOST_EMAILS,
    subject: 'Test from RSVP script ✅',
    body: 'If you got this, Gmail permission is working.'
  });
  updateGuestListDoc(['Test Guest']);
}
