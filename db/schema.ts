import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
 id:text('id').primaryKey(), email:text('email').notNull().unique(), password:text('password').notNull(), role:text('role').notNull(), name:text('name').notNull(), birthDate:text('birth_date').notNull().default(''), phone:text('phone').notNull().default(''), specialty:text('specialty').notNull().default(''), clinic:text('clinic').notNull().default(''), bio:text('bio').notNull().default(''), contactEmail:text('contact_email').notNull().default(''), schedule:text('schedule').notNull().default(''), demoGroup:text('demo_group'), createdAt:integer('created_at').notNull()
});
export const sessions = sqliteTable('sessions', {token:text('token').primaryKey(), userId:text('user_id').notNull().references(()=>users.id), expires:integer('expires').notNull()});
export const patientRecords = sqliteTable('patient_records', {patientId:text('patient_id').primaryKey().references(()=>users.id), doctorId:text('doctor_id').notNull().references(()=>users.id), status:text('status').notNull().default('stable'), summary:text('summary').notNull().default(''), recommendations:text('recommendations').notNull().default(''), privateNotes:text('private_notes').notNull().default(''), updatedAt:integer('updated_at').notNull()},t=>[index('records_by_doctor').on(t.doctorId)]);
export const invitations = sqliteTable('invitations', {token:text('token').primaryKey(), doctorId:text('doctor_id').notNull().references(()=>users.id), expires:integer('expires').notNull(), usedBy:text('used_by'), createdAt:integer('created_at').notNull()});
export const loginAttempts = sqliteTable('login_attempts', {key:text('key').primaryKey(), count:integer('count').notNull(), resetAt:integer('reset_at').notNull()});

// Patient-owned records. Sharing is tied to an explicitly selected current doctor.
export const moodEntries = sqliteTable('mood_entries', {
 id:text('id').primaryKey(), patientId:text('patient_id').notNull().references(()=>users.id), mood:integer('mood').notNull(), emotions:text('emotions').notNull().default('[]'), note:text('note').notNull().default(''), sharedDoctorId:text('shared_doctor_id').references(()=>users.id), createdAt:integer('created_at').notNull()
},t=>[index('mood_by_patient').on(t.patientId,t.createdAt),index('mood_by_doctor').on(t.sharedDoctorId)]);
export const chatTurns = sqliteTable('chat_turns', {
 id:integer('id').primaryKey({autoIncrement:true}), requestId:text('request_id').notNull().unique(), patientId:text('patient_id').notNull().references(()=>users.id), message:text('message').notNull(), reply:text('reply').notNull(), kind:text('kind').notNull().default('llm'), createdAt:integer('created_at').notNull()
},t=>[index('chat_by_patient').on(t.patientId,t.id)]);
