
import firebase from './firebase.js';
import 'firebase/compat/functions';

/**
 * Loads exam configuration based on URL parameters and user role.
 * 
 * @param {string} role - 'teacher' | 'student' | 'manager'
 * @returns {Promise<Object>} - The loaded configuration data
 */
export async function loadExamData(role) {
    const params = new URLSearchParams(window.location.search);
    const examId = params.get('examId');

    if (!examId) {
        throw new Error("Missing 'examId' in URL parameters.");
    }

    const functions = firebase.functions();

    try {
        let response;
        if (role === 'teacher' || role === 'manager') {
            // For teachers, we fetch the full exam metadata + roster
            // Assuming a 'getExam' or similar action exists in manageExams, 
            // or we interpret GET_ALL result if GET_ONE isn't available. 
            // For safety, let's assume we might need to fetch all and find one, 
            // OR rely on a specific GET/READ action.
            // Given the legacy code in exam_manager uses GET_ALL, we try GET_INFO first.
            response = await functions.httpsCallable('manageExams')({
                action: 'GET_INFO',
                examId: examId
            });
        } else {
            // For students, we fetch session config
            response = await functions.httpsCallable('manageExamSession')({
                action: 'GET_METADATA',
                examId: examId
            });
        }

        if (!response.data) {
            throw new Error("No data returned from server.");
        }

        return response.data;
    } catch (error) {
        console.error("Exam Data Load Error:", error);
        throw error;
    }
}

/**
 * Updates DOM elements with 'loading' state to 'loaded' logic
 */
export function updateDomWithConfig(config, role) {
    if (role === 'teacher') {
        const { examConfig, rosterMap } = config;

        // Update Globals for legacy support
        window.EXAM_CONFIG = examConfig;
        window.ROSTER_MAP = rosterMap || {};

        // Update Headers
        const headerEl = document.getElementById('exam-name-header');
        if (headerEl) headerEl.textContent = examConfig.examName;

    } else if (role === 'student') {
        const { examConfig, studentInfo, studentKey } = config;

        // Update Globals
        window.EXAM_CONFIG = examConfig;
        window.STUDENT_INFO = studentInfo || {};
        window.STUDENT_KEY = studentKey;

        // Update Headers
        const headerEl = document.getElementById('exam-name-header');
        if (headerEl) headerEl.textContent = examConfig.examName;

        const entryHeader = document.getElementById('exam-name-entry');
        if (entryHeader) entryHeader.textContent = examConfig.examName;

        const studentNameEl = document.getElementById('student-name-display');
        if (studentNameEl) studentNameEl.textContent = studentInfo.displayName || 'Student';

        const durationEl = document.getElementById('exam-duration-entry');
        if (durationEl) {
            durationEl.textContent = examConfig.durationMinutes > 0
                ? examConfig.durationMinutes + ' mins'
                : 'Untimed';
        }

        // Rules
        if (examConfig.proctorMode === 'hard') {
            document.getElementById('rule-hard-lock')?.classList.remove('hidden');
        }
    }
}
