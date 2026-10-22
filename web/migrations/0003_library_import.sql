CREATE TABLE `library_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`rel` text NOT NULL,
	`sku` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`model_id` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `library_imports_status_idx` ON `library_imports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `library_imports_rel_idx` ON `library_imports` (`rel`);--> statement-breakpoint
CREATE TABLE `library_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`candidates` text,
	`total_found` integer,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
