CREATE TABLE `agent_channels` (
	`agent_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`alias` text NOT NULL,
	`role_description` text,
	`subscribed_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`agent_id`, `channel_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_alias` ON `agent_channels` (`channel_id`,`alias`);--> statement-breakpoint
CREATE TABLE `agent_group_members` (
	`agent_id` text NOT NULL,
	`group_id` text NOT NULL,
	`joined_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`agent_id`, `group_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `agent_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agent_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`working_dir` text NOT NULL,
	`last_heartbeat` integer DEFAULT (unixepoch()) NOT NULL,
	`current_task_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `context` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text,
	`target_agent` text NOT NULL,
	`content` text NOT NULL,
	`injected_by` text DEFAULT 'moderator' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`applied_by` text,
	`applied_at` integer
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`from_agent` text NOT NULL,
	`from_alias` text,
	`to_agent` text,
	`to_alias` text,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`read_at` integer,
	`done_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`assigned_to` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`parent_task_id` integer,
	`result` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
