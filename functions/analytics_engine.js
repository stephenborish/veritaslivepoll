/**
 * VERITAS Live Poll - Analytics Engine
 * Ported from Model_Analytics.gs
 */

const logger = require("firebase-functions/logger");

/**
 * Ported: calculatePointBiserial
 */
function calculatePointBiserial(itemScores, totalScores) {
    if (itemScores.length < 5) return 0;

    const n = itemScores.length;
    let sumCorrect = 0;
    let countCorrect = 0;
    let sumIncorrect = 0;
    let countIncorrect = 0;

    itemScores.forEach((correct, idx) => {
        if (correct) {
            sumCorrect += totalScores[idx];
            countCorrect++;
        } else {
            sumIncorrect += totalScores[idx];
            countIncorrect++;
        }
    });

    if (countCorrect === 0 || countIncorrect === 0) return 0;

    const meanCorrect = sumCorrect / countCorrect;
    const meanIncorrect = sumIncorrect / countIncorrect;

    const overallMean = totalScores.reduce((a, b) => a + b, 0) / n;
    const variance = totalScores.reduce((sum, score) => sum + Math.pow(score - overallMean, 2), 0) / n;
    const sd = Math.sqrt(variance);

    if (sd === 0) return 0;

    const p = countCorrect / n;
    const q = countIncorrect / n;
    const rbis = ((meanCorrect - meanIncorrect) / sd) * Math.sqrt(p * q);

    return Math.round(rbis * 100) / 100;
}

/**
 * Ported: calculateDiscriminationIndex
 */
function calculateDiscriminationIndex(responses, studentTotalScores) {
    if (responses.length < 10) return 0;

    const scoredResponses = responses
        .map(r => ({
            email: r.email,
            isCorrect: r.isCorrect,
            totalScore: studentTotalScores[r.email] || 0
        }))
        .sort((a, b) => b.totalScore - a.totalScore);

    const groupSize = Math.max(1, Math.floor(scoredResponses.length * 0.27));
    const highGroup = scoredResponses.slice(0, groupSize);
    const lowGroup = scoredResponses.slice(-groupSize);

    const highCorrect = highGroup.filter(r => r.isCorrect).length / highGroup.length;
    const lowCorrect = lowGroup.filter(r => r.isCorrect).length / lowGroup.length;

    return highCorrect - lowCorrect;
}

/**
 * Ported Interpretations
 */
const interpretations = {
    difficulty: (pValue) => {
        if (pValue >= 0.9) return { level: 'very-easy', message: 'Very Easy (>90% correct)', color: 'blue' };
        if (pValue >= 0.75) return { level: 'easy', message: 'Easy (75-90% correct)', color: 'green' };
        if (pValue >= 0.5) return { level: 'moderate', message: 'Moderate (50-75% correct)', color: 'green' };
        if (pValue >= 0.3) return { level: 'hard', message: 'Hard (30-50% correct)', color: 'yellow' };
        return { level: 'very-hard', message: 'Very Hard (<30% correct)', color: 'red' };
    },
    discrimination: (discrimination) => {
        if (discrimination >= 0.4) return { level: 'excellent', message: 'Excellent (>0.4)', color: 'green' };
        if (discrimination >= 0.3) return { level: 'good', message: 'Good (0.3-0.4)', color: 'green' };
        if (discrimination >= 0.15) return { level: 'fair', message: 'Fair (0.15-0.3)', color: 'yellow' };
        if (discrimination >= 0) return { level: 'poor', message: 'Poor (0-0.15)', color: 'orange' };
        return { level: 'negative', message: 'NEGATIVE (<0) - FLAWED', color: 'red' };
    }
};

/**
 * Core Engine: computeAnalytics
 */
function computeAnalytics(historyData, rostersData) {
    // historyData: { pollId: { sessionId: payload } }
    // rostersData: { className: [students] }

    // Flatten sessions for easier processing
    const allSessions = [];
    Object.keys(historyData).forEach(pollId => {
        Object.keys(historyData[pollId]).forEach(sessionId => {
            allSessions.push(historyData[pollId][sessionId]);
        });
    });

    const sessionAggregates = allSessions.map(session => {
        const pollId = session.pollId;
        const roster = rostersData[session.className] || [];
        const totalStudents = roster.length;

        // Process answers
        const answers = session.answers || {};
        const participatingStudents = new Set(Object.keys(answers));

        let totalCorrect = 0;
        let totalAnswered = 0;

        // Calculate mastery per session
        Object.values(answers).forEach(studentAnswers => {
            Object.values(studentAnswers).forEach(qAnswer => {
                if (qAnswer.questionIndex !== -1) {
                    totalAnswered++;
                    if (qAnswer.isCorrect) totalCorrect++;
                }
            });
        });

        const masteryPct = totalAnswered > 0 ? (totalCorrect / totalAnswered) * 100 : 0;
        const participationPct = totalStudents > 0 ? (participatingStudents.size / totalStudents) * 100 : 0;

        return {
            sessionId: pollId, // For legacy UI mapping
            realSessionId: session.sessionId,
            sessionName: session.pollName,
            className: session.className,
            date: session.timestamp,
            questionCount: session.questions ? session.questions.length : 0,
            participants: participatingStudents.size,
            totalStudents: totalStudents,
            masteryPct: Math.round(masteryPct * 10) / 10,
            participationPct: Math.round(participationPct * 10) / 10
        };
    });

    // Calculate KPIs (Simplified)
    const sortedSessions = sessionAggregates.sort((a, b) => b.date - a.date);
    const last5 = sortedSessions.slice(0, 5);
    const masteryLast5 = last5.length > 0 ? last5.reduce((sum, s) => sum + s.masteryPct, 0) / last5.length : 0;
    const participationPct = last5.length > 0 ? last5.reduce((sum, s) => sum + s.participationPct, 0) / last5.length : 0;

    const kpis = [
        { label: 'Mastery (Last 5)', value: Math.round(masteryLast5 * 10) / 10 + '%' },
        { label: 'Participation', value: Math.round(participationPct) + '%' }
    ];

    return {
        kpis,
        sessionAggregates
    };
}

/**
 * Ported: computeItemAnalysis
 */
function computeItemAnalysis(poll, answers) {
    // poll: { questions: [...], pollId, pollName }
    // answers: { studentEmail: { questionIndex: { isCorrect, answer, confidence } } }

    const questionCount = poll.questions.length;
    const items = [];

    for (let qIdx = 0; qIdx < questionCount; qIdx++) {
        const question = poll.questions[qIdx];
        const qResponses = [];

        // Gather all responses for this question
        Object.keys(answers).forEach(email => {
            const resp = answers[email][qIdx];
            if (resp) {
                qResponses.push({ email, ...resp });
            }
        });

        if (qResponses.length === 0) {
            items.push({
                questionIndex: qIdx,
                difficulty: 0,
                discrimination: 0,
                flags: ['no-data']
            });
            continue;
        }

        const correctCount = qResponses.filter(r => r.isCorrect).length;
        const difficulty = correctCount / qResponses.length;

        // Distractor Analysis
        const options = question.options || [];
        const distractorAnalysis = options.map((option, optIdx) => {
            const optText = typeof option === 'string' ? option : (option.text || '');
            const selections = qResponses.filter(r => r.answer === optText).length;
            return {
                option: optText,
                letter: String.fromCharCode(65 + optIdx),
                count: selections,
                pct: Math.round((selections / qResponses.length) * 100)
            };
        });

        items.push({
            questionIndex: qIdx,
            questionText: question.questionText,
            difficulty: Math.round(difficulty * 100) / 100,
            difficultyPct: Math.round(difficulty * 100),
            responseCount: qResponses.length,
            distractorAnalysis
        });
    }

    return items;
}

/**
 * Ported: computeStudentInsights
 */
function computeStudentInsights(allSessions, roster) {
    const studentProfiles = {};
    roster.forEach(student => {
        studentProfiles[student.email] = {
            email: student.email,
            name: student.name,
            totalAnswered: 0,
            correctCount: 0,
            accuracy: 0,
            participationCount: 0,
            flags: []
        };
    });

    allSessions.forEach(session => {
        const answers = session.answers || {};
        Object.keys(studentProfiles).forEach(email => {
            if (answers[email]) {
                studentProfiles[email].participationCount++;
                const studentAnswers = answers[email];
                Object.values(studentAnswers).forEach(ans => {
                    if (ans.questionIndex !== -1) {
                        studentProfiles[email].totalAnswered++;
                        if (ans.isCorrect) studentProfiles[email].correctCount++;
                    }
                });
            }
        });
    });

    return Object.values(studentProfiles).map(profile => {
        profile.accuracy = profile.totalAnswered > 0
            ? Math.round((profile.correctCount / profile.totalAnswered) * 100)
            : 0;

        if (profile.accuracy < 50 && profile.totalAnswered > 5) profile.flags.push('struggling');
        if (profile.accuracy > 85 && profile.totalAnswered > 5) profile.flags.push('high-performer');

        return profile;
    });
}

module.exports = {
    computeAnalytics,
    computeItemAnalysis,
    computeStudentInsights,
    calculatePointBiserial,
    calculateDiscriminationIndex,
    interpretations
};
