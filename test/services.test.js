const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normaliseEmail,
  validEmail,
  validMobile,
  escapeHtml,
  allowedLeadStatuses,
  allowedEventNames
} = require('../backend/services');
const { summariseLeads } = require('../server');

test('normaliseEmail trims and lowercases an email', () => {
  assert.equal(normaliseEmail('  Rahul@Example.COM '), 'rahul@example.com');
});

test('validEmail accepts a normal email and rejects invalid values', () => {
  assert.equal(validEmail('rahul@example.com'), true);
  assert.equal(validEmail('not-an-email'), false);
});

test('validMobile accepts Indian mobile and international format', () => {
  assert.equal(validMobile('9876543210'), true);
  assert.equal(validMobile('+919876543210'), true);
  assert.equal(validMobile('12345'), false);
});

test('escapeHtml prevents HTML markup injection', () => {
  assert.equal(escapeHtml('<script>"x" & y</script>'), '&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;');
});

test('lead and analytics events use allowlists', () => {
  assert.equal(allowedLeadStatuses.has('Interested'), true);
  assert.equal(allowedLeadStatuses.has('Administrator'), false);
  assert.equal(allowedEventNames.has('page_view'), true);
  assert.equal(allowedEventNames.has('delete_database'), false);
});

test('summariseLeads calculates counts and conversion rate', () => {
  const result = summariseLeads([
    { lead_status: 'New Enquiry', enrolment_status: 'Not Started', next_follow_up_date: null },
    { lead_status: 'Interested', enrolment_status: 'Not Started', next_follow_up_date: null },
    { lead_status: 'Enrolled — Verified', enrolment_status: 'Enrolled — Verified', next_follow_up_date: null }
  ]);
  assert.equal(result.total, 3);
  assert.equal(result.new, 1);
  assert.equal(result.interested, 1);
  assert.equal(result.verifiedEnrolments, 1);
  assert.equal(result.conversionRate, 33.3);
});
