CREATE TABLE `todo_checklist_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`todo_id` bigint unsigned NOT NULL,
	`title` varchar(500) NOT NULL,
	`checked_at` datetime(3),
	`position` smallint unsigned NOT NULL,
	CONSTRAINT `todo_checklist_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `todo_lists` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`name` varchar(100) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `todo_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `todos` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`list_id` bigint unsigned NOT NULL,
	`title` varchar(500) NOT NULL,
	`memo` text NOT NULL,
	`due_date` date,
	`importance` enum('normal','high') NOT NULL DEFAULT 'normal',
	`repeat_type` enum('daily','weekly','monthly','yearly'),
	`repeat_interval` smallint unsigned,
	`reminder_at` datetime(3),
	`completed_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `todos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `todo_checklist_items` ADD CONSTRAINT `todo_checklist_items_todo_id_todos_id_fk` FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_lists` ADD CONSTRAINT `todo_lists_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_list_id_todo_lists_id_fk` FOREIGN KEY (`list_id`) REFERENCES `todo_lists`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `todo_lists_user_id_idx` ON `todo_lists` (`user_id`);--> statement-breakpoint
CREATE INDEX `todos_user_completed_idx` ON `todos` (`user_id`,`completed_at`);