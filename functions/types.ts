/**
 * VERITAS LIVE POLL - FIRESTORE TYPE DEFINITIONS
 *
 * TypeScript interfaces for Firestore collections and documents.
 * These types define the schema for all Firestore data structures.
 *
 * Architecture: Firestore V9 SDK, modular imports
 * NO dependencies on legacy Google Apps Script code
 */

// ============================================================================
// TEACHERS COLLECTION
// Path: /teachers/{uid}
// ============================================================================

export interface Teacher {
  uid: string;
  email: string;
  displayName: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ============================================================================
// CLASSES COLLECTION
// Path: /classes/{classId}
// ============================================================================

export interface Class {
  classId: string;
  className: string;
  teacherId: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ============================================================================
// STUDENTS SUB-COLLECTION
// Path: /classes/{classId}/students/{studentId}
// ============================================================================

export interface Student {
  studentId: string;
  name: string;
  email: string;
  emailHash: string; // MD5 or SHA256 hash for secure lookups
  createdAt: FirebaseFirestore.Timestamp;
}

// ============================================================================
// POLLS COLLECTION
// Path: /polls/{pollId}
// ============================================================================

export interface Poll {
  pollId: string;
  pollName: string;
  teacherId: string;
  sessionType: 'LIVE_POLL' | 'SECURE_ASSESSMENT';
  settings: PollSettings;
  metacognitionEnabled: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface PollSettings {
  timeLimitMinutes?: number;
  allowReview?: boolean;
  shuffleQuestions?: boolean;
  showResults?: boolean;
}

// ============================================================================
// QUESTIONS SUB-COLLECTION
// Path: /polls/{pollId}/questions/{questionId}
// ============================================================================

export interface Question {
  questionId: string;
  stemHtml: string; // Question text with HTML formatting
  options: QuestionOption[];
  correctAnswer: string | number; // Index or value of correct answer
  points: number;
  order: number; // Display order in the poll
}

export interface QuestionOption {
  text: string;
  imageUrl?: string;
}

// ============================================================================
// SESSIONS COLLECTION
// Path: /sessions/{sessionId}
// ============================================================================

export interface Session {
  sessionId: string;
  pollId: string;
  teacherId: string;
  status: SessionStatus;
  accessCode: string;
  currentQuestionIndex?: number;
  createdAt: FirebaseFirestore.Timestamp;
  lastUpdate?: FirebaseFirestore.Timestamp;
}

export type SessionStatus = 'WAITING' | 'ACTIVE' | 'PAUSED' | 'CLOSED';

// ============================================================================
// SESSION STUDENTS SUB-COLLECTION
// Path: /sessions/{sessionId}/students/{studentId}
// ============================================================================

export interface SessionStudent {
  studentId: string;
  name: string;
  status: StudentStatus;
  answers: { [questionId: string]: StudentAnswer };
  joinedAt: FirebaseFirestore.Timestamp;
  lastViolation?: string;
  lastViolationAt?: FirebaseFirestore.Timestamp;
  unlockCount?: number;
  unlockedAt?: FirebaseFirestore.Timestamp;
  unlockedBy?: string;
}

export type StudentStatus = 'ACTIVE' | 'LOCKED' | 'FINISHED';

export interface StudentAnswer {
  questionId: string;
  answer: string | number;
  confidence?: boolean; // For metacognition tracking
  submittedAt: FirebaseFirestore.Timestamp;
  isCorrect?: boolean;
  score?: number;
}

// ============================================================================
// SESSION RESPONSES SUB-COLLECTION
// Path: /sessions/{sessionId}/responses/{responseId}
// ============================================================================

export interface Response {
  responseId: string;
  studentId: string;
  questionId: string;
  answer: string | number;
  confidence?: boolean;
  submittedAt: FirebaseFirestore.Timestamp;
  isGraded: boolean;
  isCorrect?: boolean;
  score?: number;
  gradedAt?: FirebaseFirestore.Timestamp;
}

// ============================================================================
// QUESTION BANK COLLECTION
// Path: /question_bank/{questionId}
// ============================================================================

export interface QuestionBankItem {
  questionId: string;
  teacherId: string;
  text: string;
  options: QuestionOption[];
  correctAnswer: string | number;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ============================================================================
// REPORTS COLLECTION
// Path: /reports/{reportId}
// ============================================================================

export interface Report {
  reportId: string;
  sessionId: string;
  generatedAt: FirebaseFirestore.Timestamp;
  itemAnalysis: ItemAnalysis[];
  metacognition: MetacognitionMatrix;
  totalParticipants: number;
}

export interface ItemAnalysis {
  questionId: string;
  difficulty: number; // Percentage correct (0-1)
  discrimination?: number; // Point-biserial correlation
  totalResponses: number;
}

export interface MetacognitionMatrix {
  mastery: number; // Confident & Correct
  misconception: number; // Confident & Wrong
  guessing: number; // Unsure & Correct
  gap: number; // Unsure & Wrong
}

// ============================================================================
// CLOUD FUNCTION REQUEST/RESPONSE TYPES
// ============================================================================

// Create Class Request
export interface CreateClassRequest {
  className: string;
}

export interface CreateClassResponse {
  success: boolean;
  classId: string;
  message?: string;
}

// Bulk Add Students Request
export interface BulkAddStudentsRequest {
  classId: string;
  students: Array<{
    name: string;
    email: string;
  }>;
}

export interface BulkAddStudentsResponse {
  success: boolean;
  addedCount: number;
  skippedCount: number;
  message?: string;
}

// Create Session Request
export interface CreateSessionRequest {
  pollId: string;
}

export interface CreateSessionResponse {
  success: boolean;
  sessionId: string;
  accessCode: string;
  message?: string;
}

// Join Session Request
export interface JoinSessionRequest {
  accessCode: string;
  studentName: string;
}

export interface JoinSessionResponse {
  success: boolean;
  sessionId: string;
  studentId: string;
  message?: string;
}

// Submit Response Request
export interface SubmitResponseRequest {
  sessionId: string;
  questionId: string;
  answer: string | number;
  confidence?: boolean;
}

export interface SubmitResponseResponse {
  success: boolean;
  message?: string;
}

// Generate Report Request
export interface GenerateReportRequest {
  sessionId: string;
}

export interface GenerateReportResponse {
  success: boolean;
  reportId: string;
  message?: string;
}
