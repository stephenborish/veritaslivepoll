#!/usr/bin/env bash
set -euo pipefail

PROJECT_NS="classroomproctor"
RTDB="http://127.0.0.1:9000"
AUTH="http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1"
API_KEY="fake-api-key"
POLL_ID="poll-e2e-1"
CLASS_NAME="Biology"
STUDENT_EMAIL="student1@example.com"

student_key=$(node -e "const crypto=require('crypto');const s='${POLL_ID}:${STUDENT_EMAIL}'.toLowerCase().trim();console.log(crypto.createHash('sha256').update(s).digest('hex').slice(0,16));")

echo "[1] Create teacher + student auth tokens"
teacher_signin=$(curl -sS -X POST "${AUTH}/accounts:signInWithPassword?key=${API_KEY}" -H 'Content-Type: application/json' -d '{"email":"teacher@example.com","password":"password123","returnSecureToken":true}')
teacher_token=$(echo "$teacher_signin" | jq -r '.idToken')
if [[ "$teacher_token" == "null" ]]; then
  teacher_signup=$(curl -sS -X POST "${AUTH}/accounts:signUp?key=${API_KEY}" -H 'Content-Type: application/json' -d '{"email":"teacher@example.com","password":"password123","returnSecureToken":true}')
  teacher_token=$(echo "$teacher_signup" | jq -r '.idToken')
fi
student_signup=$(curl -sS -X POST "${AUTH}/accounts:signUp?key=${API_KEY}" -H 'Content-Type: application/json' -d '{"returnSecureToken":true}')
student_token=$(echo "$student_signup" | jq -r '.idToken')
student_uid=$(echo "$student_signup" | jq -r '.localId')

echo "[2] Seed roster + poll + token + live_session"
cat > /tmp/workflow_seed.json <<JSON
{
  "rosters": {"rosters": {"${CLASS_NAME}":[{"name":"Student One","email":"${STUDENT_EMAIL}"}]},"classes":["${CLASS_NAME}"]},
  "polls": {"${POLL_ID}": {"pollId":"${POLL_ID}","pollName":"E2E Workflow Poll","className":"${CLASS_NAME}","sessionType":"LIVE_POLL","questions":[{"questionText":"2+2=?","options":["3","4","5"],"correctAnswer":1}],"questionCount":1}},
  "tokens": {"tokentest1":{"email":"${STUDENT_EMAIL}","className":"${CLASS_NAME}","created":1700000000000,"expires":1999999999999}},
  "tokens_index": {"${CLASS_NAME}":{"student1@example_com":"tokentest1"}},
  "sessions": {"${POLL_ID}": {"live_session":{"pollId":"${POLL_ID}","status":"OPEN","questionIndex":0,"questionText":"2+2=?","options":["3","4","5"],"metadata":{"sessionPhase":"LIVE","resultsVisibility":"HIDDEN"}}}}
}
JSON
curl -sS -X PATCH "${RTDB}/.json?ns=${PROJECT_NS}" -d @/tmp/workflow_seed.json >/dev/null

echo "[3] Join presence write"
cat > /tmp/student_join.json <<JSON
{"status":"ACTIVE","name":"Student One","email":"${STUDENT_EMAIL}","uid":"${student_uid}","joinedAt":1700000001000,"lockVersion":0}
JSON
curl -sS -X PUT "${RTDB}/sessions/${POLL_ID}/students/${student_key}.json?ns=${PROJECT_NS}&auth=${student_token}" -d @/tmp/student_join.json >/dev/null

join_state=$(curl -sS "${RTDB}/sessions/${POLL_ID}/students/${student_key}.json?ns=${PROJECT_NS}&auth=${teacher_token}")
echo "$join_state" | jq -e '.status == "ACTIVE" and .uid != null and .email == "'"${STUDENT_EMAIL}"'"' >/dev/null

echo "[4] Submit answer write"
cat > /tmp/student_answer.json <<JSON
{"responseId":"resp-1","pollId":"${POLL_ID}","questionIndex":0,"answer":"4","answerId":"opt-1","studentEmail":"${STUDENT_EMAIL}","studentUid":"${student_uid}","timestamp":"2026-01-01T00:00:00.000Z","clientTimestamp":1700000002000}
JSON
curl -sS -X PUT "${RTDB}/answers/${POLL_ID}/${student_key}.json?ns=${PROJECT_NS}&auth=${student_token}" -d @/tmp/student_answer.json >/dev/null
answer_state=$(curl -sS "${RTDB}/answers/${POLL_ID}/${student_key}.json?ns=${PROJECT_NS}&auth=${teacher_token}")
echo "$answer_state" | jq -e '.questionIndex == 0 and .answer == "4" and .studentUid != null' >/dev/null

echo "[5] Violation and teacher reconcile (resume approval)"
# emulate reportStudentViolation result
curl -sS -X PATCH "${RTDB}/sessions/${POLL_ID}/students/${student_key}.json?ns=${PROJECT_NS}&auth=${teacher_token}" -d '{"status":"LOCKED","lockVersion":1,"lastViolationReason":"tab_switch","lastViolationAt":1700000003000}' >/dev/null
curl -sS -X PUT "${RTDB}/sessions/${POLL_ID}/activities/${student_key}/event1.json?ns=${PROJECT_NS}&auth=${teacher_token}" -d '{"type":"VIOLATION","reason":"tab_switch","timestamp":1700000003000}' >/dev/null
# emulate manageProctoring UNLOCK result
curl -sS -X PATCH "${RTDB}/sessions/${POLL_ID}/students/${student_key}.json?ns=${PROJECT_NS}&auth=${teacher_token}" -d '{"status":"AWAITING_FULLSCREEN","unlockApproved":true,"unlockApprovedAt":1700000004000}' >/dev/null

final_state=$(curl -sS "${RTDB}/sessions/${POLL_ID}/students/${student_key}.json?ns=${PROJECT_NS}&auth=${teacher_token}")
echo "$final_state" | jq -e '.status == "AWAITING_FULLSCREEN" and .unlockApproved == true and .lastViolationReason == "tab_switch"' >/dev/null
activity_state=$(curl -sS "${RTDB}/sessions/${POLL_ID}/activities/${student_key}.json?ns=${PROJECT_NS}&auth=${teacher_token}")
echo "$activity_state" | jq -e 'to_entries | length >= 1' >/dev/null

echo "Workflow smoke passed"
