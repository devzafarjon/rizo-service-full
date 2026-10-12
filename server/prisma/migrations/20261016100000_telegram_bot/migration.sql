-- AlterTable
ALTER TABLE "staff_users" ADD COLUMN     "telegram_chat_id" TEXT,
ADD COLUMN     "telegram_notify" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "telegram_chats" (
    "chat_id" TEXT NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'uz',
    "state" TEXT,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_chats_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "telegram_link_tokens" (
    "token" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "telegram_link_tokens_subject_id_idx" ON "telegram_link_tokens"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_telegram_chat_id_key" ON "staff_users"("telegram_chat_id");

