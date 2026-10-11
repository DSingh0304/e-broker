-- E-Broker local init (generated from api.db.models; Alembic owns prod migrations).
-- Regenerate with: ./venv/bin/python -c "from sqlalchemy.schema import CreateTable; ..."
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS admin_users (
	id VARCHAR(36) NOT NULL,
	cognito_sub VARCHAR(128) NOT NULL,
	role VARCHAR(32) NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (cognito_sub)
);
CREATE TABLE IF NOT EXISTS materials (
	id SERIAL NOT NULL,
	name VARCHAR(64) NOT NULL,
	price_per_kg FLOAT NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (name)
);
CREATE TABLE IF NOT EXISTS recyclers (
	id VARCHAR(36) NOT NULL,
	name TEXT NOT NULL,
	address TEXT NOT NULL,
	city VARCHAR(64) NOT NULL,
	state VARCHAR(64) NOT NULL,
	lat FLOAT NOT NULL,
	lng FLOAT NOT NULL,
	phone VARCHAR(32),
	email VARCHAR(128),
	website VARCHAR(256),
	cpcb_reg_no VARCHAR(64),
	cpcb_valid_until TIMESTAMP WITH TIME ZONE,
	accepts JSONB,
	min_quantity_kg FLOAT NOT NULL,
	processing_types JSONB,
	verified BOOLEAN NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS training_runs (
	id VARCHAR(36) NOT NULL,
	modal_run_id VARCHAR(128) NOT NULL,
	triggered_by VARCHAR(128) NOT NULL,
	triggered_at TIMESTAMP WITH TIME ZONE NOT NULL,
	status VARCHAR(16) NOT NULL,
	epochs INTEGER NOT NULL,
	dataset_images INTEGER,
	metrics JSONB,
	completed_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS users (
	id VARCHAR(36) NOT NULL,
	cognito_sub VARCHAR(128) NOT NULL,
	phone_number VARCHAR(32),
	full_name VARCHAR(128),
	role VARCHAR(16) NOT NULL,
	password_hash VARCHAR(256),
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	total_value_recovered FLOAT NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (cognito_sub),
	UNIQUE (phone_number)
);
CREATE TABLE IF NOT EXISTS images (
	id VARCHAR(36) NOT NULL,
	s3_key TEXT NOT NULL,
	s3_url TEXT NOT NULL,
	uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL,
	uploader_id VARCHAR(64) NOT NULL,
	user_id VARCHAR(36),
	width INTEGER NOT NULL,
	height INTEGER NOT NULL,
	review_status VARCHAR(16) NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS model_versions (
	id VARCHAR(36) NOT NULL,
	run_id VARCHAR(36),
	s3_key TEXT NOT NULL,
	map50 FLOAT,
	map50_95 FLOAT,
	per_class JSONB,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	deployed_at TIMESTAMP WITH TIME ZONE,
	retired_at TIMESTAMP WITH TIME ZONE,
	approved_by VARCHAR(128),
	canary_traffic_pct INTEGER NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(run_id) REFERENCES training_runs (id)
);
CREATE TABLE IF NOT EXISTS vendor_profiles (
	id VARCHAR(36) NOT NULL,
	user_id VARCHAR(36) NOT NULL,
	company_name TEXT NOT NULL,
	cpcb_reg_no TEXT NOT NULL,
	address TEXT,
	verified BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (user_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS agent_results (
	id VARCHAR(36) NOT NULL,
	image_id VARCHAR(36) NOT NULL,
	result JSONB,
	status VARCHAR(16) NOT NULL,
	error_detail TEXT,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	completed_at TIMESTAMP WITH TIME ZONE,
	duration_ms INTEGER,
	PRIMARY KEY (id),
	FOREIGN KEY(image_id) REFERENCES images (id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS detections (
	id VARCHAR(36) NOT NULL,
	image_id VARCHAR(36) NOT NULL,
	class_name VARCHAR(32) NOT NULL,
	confidence FLOAT NOT NULL,
	bbox JSONB NOT NULL,
	model_version VARCHAR(64) NOT NULL,
	detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(image_id) REFERENCES images (id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS labels (
	id VARCHAR(36) NOT NULL,
	image_id VARCHAR(36) NOT NULL,
	class_name VARCHAR(32) NOT NULL,
	bbox JSONB NOT NULL,
	source VARCHAR(16) NOT NULL,
	created_by VARCHAR(128) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	is_active BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(image_id) REFERENCES images (id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS listings (
	id VARCHAR(36) NOT NULL,
	seller_id VARCHAR(36) NOT NULL,
	image_id VARCHAR(36) NOT NULL,
	total_weight_kg FLOAT,
	asking_price FLOAT,
	status VARCHAR(16) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(seller_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(image_id) REFERENCES images (id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS bids (
	id VARCHAR(36) NOT NULL,
	listing_id VARCHAR(36) NOT NULL,
	vendor_id VARCHAR(36) NOT NULL,
	bid_amount FLOAT NOT NULL,
	status VARCHAR(16) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(listing_id) REFERENCES listings (id) ON DELETE CASCADE,
	FOREIGN KEY(vendor_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_images_review_status ON images(review_status);
CREATE INDEX IF NOT EXISTS idx_detections_image ON detections(image_id);
CREATE INDEX IF NOT EXISTS idx_labels_image_active ON labels(image_id, is_active);
CREATE INDEX IF NOT EXISTS idx_agent_results_image ON agent_results(image_id);
