
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                student: resolve(__dirname, 'student.html'),
                exam_manager: resolve(__dirname, 'exam_manager.html'),
                exam_teacher: resolve(__dirname, 'exam_teacher.html'),
                exam_student: resolve(__dirname, 'exam_student.html'),
                question_bank: resolve(__dirname, 'question_bank.html'),
            },
        },
    },
    server: {
        port: 3000,
        open: true,
    },
});
