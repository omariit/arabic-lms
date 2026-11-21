-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ExamAttempt" ADD COLUMN     "questionOrder" JSONB;
