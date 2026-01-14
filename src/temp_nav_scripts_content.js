
// --- New Navigation Helper Functions ---

function renderQuestionCardContent(index) {
    // This function is responsible for updating the "Question Card" area 
    // to show the question at `index`, regardless of what is "Live".
    // Note: This needs to locate the DOM elements for Question Text, Answers, etc.

    if (!CURRENT_POLL_DATA.questions || !CURRENT_POLL_DATA.questions[index]) return;
    var q = CURRENT_POLL_DATA.questions[index];

    // 1. Update Question Text
    var qTextEl = document.getElementById('live-question-text');
    if (qTextEl) {
        qTextEl.textContent = q.questionText || '';
    }

    // 2. Update Question Image
    var qImgContainer = document.getElementById('live-question-image-container');
    var qImg = document.getElementById('live-question-image');
    if (qImgContainer && qImg) {
        var imgUrl = getImagePreviewUrl(q.questionImage || q.questionImageURL, q.questionImageFileId);
        if (imgUrl) {
            qImg.src = imgUrl;
            qImgContainer.classList.remove('hidden');
        } else {
            qImgContainer.classList.add('hidden');
        }
    }

    // 3. Update Answers?
    // Currently `renderResultsBars` handles the answer bars. 
    // If we are looking at a PAST question, we might want to see the results for THAT question?
    // OR if we are looking at a FUTURE question, we see the options but no results.

    // Since the "Live Results" bars are driven by Realtime Data, 
    // showing results for a non-live question is tricky unless we fetch that data.
    // For now, let's just update the TEXT of the bars to match the question's options.
    // The "Results" (percentages) will likely be inaccurate (showing live data) unless we clear them.

    var resultsContainer = document.getElementById('results-bars');
    if (resultsContainer) {
        // Re-render empty bars for the new question's options
        // This clears the "Live" results from the view, which is correct (don't show Q1 results on Q2)
        resultsContainer.innerHTML = '';

        var options = q.answers || q.options || [];
        if (options.length > 0) {
            options.forEach(function (opt, idx) {
                // Simple render of option text without data
                var row = document.createElement('div');
                row.className = 'mb-3';
                var label = String.fromCharCode(65 + idx);

                row.innerHTML = `
                        <div class="flex justify-between text-sm mb-1">
                           <span class="font-bold">${label}. ${escapeHtml(opt.text || '')}</span>
                           <span class="text-gray-500">View Only</span>
                        </div>
                        <div class="h-8 w-full bg-gray-100 rounded-lg overflow-hidden relative">
                           <div class="h-full bg-gray-200" style="width: 0%"></div>
                        </div>
                     `;
                resultsContainer.appendChild(row);
            });
        }
    }

    // Update Q# Info
    var infoEl = document.getElementById('live-question-info');
    if (infoEl) {
        infoEl.textContent = 'Q' + (index + 1) + ' / ' + CURRENT_POLL_DATA.questions.length;
    }
}

function onPresentQuestion() {
    if (localTeacherViewIndex === null) return;

    // Push the local index to the live session
    var pollId = CURRENT_POLL_DATA.pollId;
    var index = localTeacherViewIndex;
    var qDef = (CURRENT_POLL_DATA.questions && CURRENT_POLL_DATA.questions[index]) ? CURRENT_POLL_DATA.questions[index] : null;

    setButtonLoading(document.getElementById('header-present-btn'), true);

    var setSessionFn = firebase.functions().httpsCallable('setLiveSessionState');
    setSessionFn({
        pollId: pollId,
        questionIndex: index,
        status: 'OPEN',
        questionText: qDef ? qDef.questionText : '',
        options: qDef ? qDef.options : []
    }).then(function () {
        setButtonLoading(document.getElementById('header-present-btn'), false);
        // On success, the live update will come back.
        // But we can also manually hide the present button now.
        document.getElementById('header-present-btn').classList.add('hidden');
    }).catch(function (err) {
        setButtonLoading(document.getElementById('header-present-btn'), false);
        handleError(err);
    });
}
