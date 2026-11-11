import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["CLIENT", "EMPLOYEE", "ADMIN"]);
export const userStatus = pgEnum("user_status", ["ACTIVE", "SUSPENDED", "DELETED"]);
export const employeeStatus = pgEnum("employee_status", ["ACTIVE", "INACTIVE"]);
export const serviceCategory = pgEnum("service_category", ["HAIR", "NAILS", "MAKEUP", "SKIN", "OTHER"]);
export const scheduleKind = pgEnum("schedule_kind", ["APPOINTMENT", "BLOCK"]);
export const scheduleStatus = pgEnum("schedule_status", ["ACTIVE", "CANCELLED", "COMPLETED"]);
export const appointmentStatus = pgEnum("appointment_status", ["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]);
export const paymentMethod = pgEnum("payment_method", ["CASH", "PIX", "CARD"]);
export const blockStatus = pgEnum("block_status", ["ACTIVE", "CANCELLED"]);
export const outboxStatus = pgEnum("outbox_status", ["PENDING", "PROCESSING", "SUCCEEDED", "FAILED"]);
export const calendarSyncStatus = pgEnum("calendar_sync_status", ["PENDING", "SYNCED", "FAILED", "CANCELLED"]);
export const reminderChannel = pgEnum("reminder_channel", ["EMAIL", "WHATSAPP"]);
export const reminderStatus = pgEnum("reminder_status", ["PENDING", "SENT", "FAILED", "CANCELLED"]);
export const privacyRequestType = pgEnum("privacy_request_type", ["ACCESS", "CORRECTION", "DELETION"]);
export const privacyRequestStatus = pgEnum("privacy_request_status", ["RECEIVED", "IN_PROGRESS", "COMPLETED", "REJECTED"]);
