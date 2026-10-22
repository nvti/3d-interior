CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'model' NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`path` text NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`description` text,
	`meta_title` text,
	`meta_description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_kind_path_uq` ON `categories` (`kind`,`path`);--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `download_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`model_id` text NOT NULL,
	`status` text DEFAULT 'waiting_upload' NOT NULL,
	`notify_email` text,
	`emailed_at` integer,
	`expires_at` integer NOT NULL,
	`click_count` integer DEFAULT 0 NOT NULL,
	`max_clicks` integer DEFAULT 5 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `download_requests_token_hash_unique` ON `download_requests` (`token_hash`);--> statement-breakpoint
CREATE INDEX `download_requests_model_status_idx` ON `download_requests` (`model_id`,`status`);--> statement-breakpoint
CREATE INDEX `download_requests_user_idx` ON `download_requests` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `entitlements` (
	`user_id` text NOT NULL,
	`model_id` text NOT NULL,
	`order_id` text,
	`revoked` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `model_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`variants` text,
	`mime_type` text NOT NULL,
	`width` integer,
	`height` integer,
	`size_bytes` integer,
	`alt` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_r2_key_unique` ON `media` (`r2_key`);--> statement-breakpoint
CREATE TABLE `model_images` (
	`model_id` text NOT NULL,
	`media_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`caption` text,
	PRIMARY KEY(`model_id`, `media_id`),
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `model_tags` (
	`model_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`model_id`, `tag_id`),
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_tags_tag_idx` ON `model_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`sku` text,
	`title` text NOT NULL,
	`category_id` text NOT NULL,
	`price_vnd` integer DEFAULT 0 NOT NULL,
	`style` text,
	`render_engine` text,
	`max_version` text,
	`formats` text,
	`materials` text,
	`width_mm` integer,
	`depth_mm` integer,
	`height_mm` integer,
	`attributes` text,
	`subtitle` text,
	`description` text,
	`content_json` text,
	`content_html` text,
	`content_text` text,
	`file_key` text,
	`file_size_bytes` integer,
	`file_sha256` text,
	`r2_status` text DEFAULT 'absent' NOT NULL,
	`r2_upload_requested_at` integer,
	`r2_ready_at` integer,
	`r2_upload_attempts` integer DEFAULT 0 NOT NULL,
	`last_download_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`meta_title` text,
	`meta_description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `models_slug_unique` ON `models` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `models_sku_unique` ON `models` (`sku`);--> statement-breakpoint
CREATE INDEX `models_category_idx` ON `models` (`category_id`,`status`);--> statement-breakpoint
CREATE INDEX `models_status_published_idx` ON `models` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `models_r2_cleanup_idx` ON `models` (`r2_status`,`last_download_at`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`order_id` text NOT NULL,
	`model_id` text NOT NULL,
	`price_vnd` integer NOT NULL,
	PRIMARY KEY(`order_id`, `model_id`),
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_vnd` integer NOT NULL,
	`provider` text,
	`provider_ref` text,
	`paid_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_code_unique` ON `orders` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_provider_ref_unique` ON `orders` (`provider_ref`);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE TABLE `post_models` (
	`post_id` text NOT NULL,
	`model_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`post_id`, `model_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'post' NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text,
	`cover_media_id` text,
	`category_id` text,
	`content_json` text,
	`content_html` text,
	`content_text` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`author_id` text,
	`meta_title` text,
	`meta_description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_type_slug_uq` ON `posts` (`type`,`slug`);--> statement-breakpoint
CREATE INDEX `posts_status_published_idx` ON `posts` (`type`,`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'customer' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);