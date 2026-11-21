-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "LivePoll" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER,
    "status" "PollStatus" NOT NULL DEFAULT 'OPEN',
    "closeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "LivePoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivePollAnswer" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT,
    "guestSocketId" TEXT,
    "guestName" TEXT,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivePollAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LivePoll_liveSessionId_createdAt_idx" ON "LivePoll"("liveSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "LivePollAnswer_pollId_idx" ON "LivePollAnswer"("pollId");

-- CreateIndex
CREATE INDEX "LivePollAnswer_userId_idx" ON "LivePollAnswer"("userId");

-- AddForeignKey
ALTER TABLE "LivePoll" ADD CONSTRAINT "LivePoll_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivePollAnswer" ADD CONSTRAINT "LivePollAnswer_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "LivePoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
