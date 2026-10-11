# E-Broker System Architecture

**Document Owner:** Senior Staff Engineering Team
**Project:** E-Broker
**Status:** Approved for Implementation

## 1. Executive Summary & Context
E-Broker is an AI-driven platform designed to modernize e-waste collection and recycling in India. The system allows a *kabadiwala* (scrap dealer) to photograph e-waste components. These images are processed by a YOLO26 object detection model to identify specific materials. The identified components are then passed to a Strands AI agent which provides real-time pricing, toxicity warnings, generates an Extended Producer Responsibility (EPR) passport, and matches the dealer with certified local recyclers.

Crucially, the system implements a **Human-in-the-Loop (HITL) Continuous Learning Loop** to ensure the YOLO26 model continuously improves based on admin-reviewed real-world data, while strictly preventing data poisoning and regressions.

This document outlines the exhaustive architecture, security boundaries, ML pipelines, local development setup, and infrastructure-as-code layout for the E-Broker platform. Every design decision has been evaluated for scale, security, and absolute minimal cost without sacrificing enterprise-grade reliability.

---

## 2. High-Level Architecture Diagram

```text
                                          [ E-Broker Architecture ]
 
       +-------------------+         +------------------------+        +-----------------------+
       |   Kabadiwala /    |         | Cloudflare Global Edge |        |    AWS Cloud (VPC)    |
       |   User Device     | ====1==>|  - CF Pages (UI)       | ===2==>| API Gateway (HTTP)    |
       |  (Mobile Browser) |         |  - CF Workers Proxy    |        |  - AWS WAF v2       |
       +-------------------+         |  - CF Access (Admin)   |        +-----------+-----------+
                                     +------------------------+                    | (3)
                                                                                   v
                                                                       +-----------+-----------+
                                                                       |  AWS Lambda (API)     |
                                                                       | (FastAPI + Mangum)    |
                                                                       +----+------+------+----+
                                                                            |      |      |
                        +---------------------------------------------------+      |      +---------------------+
                        |                                                          |                            |
  +---------------------v---------------------+                    +---------------v---------------+     +------v------+
  |         Modal ML Infrastructure           |                    |      AWS Infrastructure       |     |  Bedrock    |
  |                                           |                    |                               |     | (Strands AI)|
  |  +----------------+   +----------------+  |                    |  +--------+      +---------+  |     +-------------+
  |  | Inference (SQS)|   | Training (Cron)|  |                    |  | Amazon |      | Amazon  |  |
  |  | Serverless A10G|<--| H100 (30 epoch)|  |                    |  |   S3   |      |   SQS   |  |
  |  +-------+--------+   +--------+-------+  |                    |  +--------+      +---------+  |
  |          |                     |          |                    |                               |
  |          +----------+----------+          |                    |  +-------------------------+  |
  |                     | (Webhooks)          |                    |  | Amazon RDS PostgreSQL 16|  |
  +---------------------|---------------------+                    |  | (Single-AZ, t4g.micro)  |  |
                        |                                          |  +-------------------------+  |
                        v                                          +-------------------------------+
               +--------+--------+
               | Internal Lambda |
               | (HMAC Protected)|
               +-----------------+
```

---

## 3. Mandatory Infrastructure Decisions & Justifications

### 3.1 Frontend & Edge Layer
*   **Hosting:** Cloudflare Pages + `@cloudflare/next-on-pages` adapter.
    *   *Justification:* Zero-cost global CDN distribution, edge rendering, seamless integration with Cloudflare Workers.
*   **Routing / Proxy:** Cloudflare Workers thin proxy (`/api/*` → AWS API Gateway).
    *   *Justification:* Prevents CORS issues, hides the internal AWS API Gateway URL, and allows edge-level transformations.
*   **Admin Security:** Cloudflare Access (Zero-Trust) for `/admin/*`.
    *   *Justification:* Protects the admin panel at the CDN layer. Only allowlisted emails bypass this to even load the app, adding defense-in-depth before AWS Cognito.

### 3.2 Backend Compute
*   **Compute:** AWS Lambda (ARM64/Graviton2 architecture, Python 3.12).
    *   *Justification:* Graviton2 provides ~34% better price/performance. Python 3.12 offers major speedups. Serverless avoids idle compute costs.
*   **Framework:** FastAPI wrapped in Mangum.
    *   *Justification:* Mangum translates AWS API Gateway ASGI requests to FastAPI natively. FastAPI provides automatic OpenAPI docs and Pydantic validation.
*   **Packaging:** Lambda container images via Amazon ECR.
    *   *Justification:* Max deployment size is 10GB (vs 250MB for zip). Completely eliminates native library compilation issues (e.g., `psycopg2`, `Pillow`, `numpy`) on Amazon Linux 2023.
*   **Microservice Grouping:** Single Lambda per logical group (`ebroker-api` for public, `ebroker-admin` for Cognito-protected, `ebroker-internal` for HMAC-protected Modal callbacks).
    *   *Justification:* Minimizes cold start blast radius, adheres to IAM least privilege per logical domain, prevents monolithic routing bugs.

### 3.3 Database & Storage
*   **Relational DB:** Amazon RDS PostgreSQL 16 (db.t4g.micro Single-AZ).
    *   *Justification:* At ~$12/month, it is the cheapest viable relational DB. Single-AZ is acceptable for a hackathon/MVP. PostgreSQL 16 offers native JSONB processing for bounding boxes.
*   **Connection Management:** RDS Proxy.
    *   *Justification:* Crucial for Serverless. Lambda functions can scale to 1000s of concurrent executions, exhausting the ~80 max connections of a `t4g.micro`. RDS proxy pools connections and solves Lambda connection storms.
*   **Object Storage:** AWS S3.
    *   *Justification:* Industry standard. BlockPublicAccess enabled by default. SSE-S3 encryption. Configured lifecycle rules (transition to Glacier after 90 days, delete after 365 days) drastically reduce long-term storage costs of unneeded images.

### 3.4 ML Infrastructure
*   **Compute Environment:** Modal.com.
*   **Training:** H100 GPU (30 epochs). Justification: Massive batch sizes, dramatically reduced training time. Modal bills by the second.
*   **Inference:** Serverless A10G invoked asynchronously via SQS.
    *   *Justification:* Decouples user HTTP upload latency from inference latency. Modal spins up in <1s.

---

## 4. Security & Network Architecture

Security is non-negotiable and treated comprehensively across network, application, and ML layers.

### 4.1 VPC Network Diagram (3-Tier)

```text
+-----------------------------------------------------------------------------------------+
| AWS VPC (CIDR: 10.0.0.0/16)                                                             |
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  | Public Subnets (AZ-a, AZ-b)                                                       |  |
|  | [Internet Gateway]   [NAT Gateway]                                                |  |
|  +-----------------------------------------------------------------------------------+  |
|           | (Egress via NAT)                                                            |
|  +--------v--------------------------------------------------------------------------+  |
|  | Private Subnets (AZ-a, AZ-b)                                                      |  |
|  | [Lambda Functions: ebroker-api, ebroker-admin, ebroker-internal]                  |  |
|  | Security Group: sg-lambda (Egress: 443 0.0.0.0/0, 5432 to sg-rds-proxy)           |  |
|  |                                                                                   |  |
|  | [VPC Endpoints (PrivateLink)]: S3(Gateway), SSM, ECR, CloudWatch                  |  |
|  +--------+--------------------------------------------------------------------------+  |
|           | (Ingress 5432)                                                              |
|  +--------v--------------------------------------------------------------------------+  |
|  | Isolated Subnets (AZ-a, AZ-b) - NO INTERNET ROUTE                                 |  |
|  | [Amazon RDS Proxy] (sg-rds-proxy: Ingress from sg-lambda, Egress to sg-rds)       |  |
|  |        |                                                                          |  |
|  | [Amazon RDS PostgreSQL] (sg-rds: Ingress from sg-rds-proxy ONLY)                  |  |
|  +-----------------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------------+
```

### 4.2 Web Application Firewall (AWS WAF v2)
Attached directly to the HTTP API Gateway.
*   **Rate Limiting:**
    *   100 req/5min per IP on `/upload`
    *   500 req/5min per IP on `/detect`
*   **Managed Rules:**
    *   `AWSManagedRulesCommonRuleSet` (blocks SQLi, XSS, etc.)
    *   `AWSManagedRulesKnownBadInputsRuleSet`
    *   `AWSManagedRulesAmazonIpReputationList` (blocks botnets)
*   **Geo-restriction:** Log-only currently, ready to enforce block on non-IN IPs.
*   **Size Restriction:** Maximum HTTP body size 10MB strictly enforced at WAF.

### 4.3 API & Transport Security
*   **Authorization:**
    *   `/admin/*` -> Cognito JWT Lambda Authorizer. Validates standard claims and custom claim `custom:role == 'admin'`.
    *   `/internal/*` -> HMAC-SHA256 `X-Internal-Key` validation. Ensures Modal callbacks are mathematically verified. Key is rotated monthly via EventBridge.
*   **Throttling (API GW Level):** 50 RPS burst, 10 RPS steady per stage.
*   **CORS:** Strictly `Access-Control-Allow-Origin: https://ebroker.pages.dev`.
*   **API Key:** API Usage Plan limits access to requests originating from the Cloudflare Workers proxy (proxy injects the key). Direct hits return 403.
*   **Traceability:** `X-Request-ID` generated at Edge and propagated through API GW, Lambda, SQS, Modal, and RDS logs.

### 4.4 File Upload Security
*   **Magic Bytes Validation:** Relies on `PIL.Image.verify()` in memory. Rejects disguised executables regardless of `Content-Type`.
*   **EXIF Stripping:** `Pillow` reconstructs the image pixels and saves a new file, silently dropping all GPS/device metadata to protect kabadiwala privacy.
*   **Sanity Constraints:** Image dimensions must be min 224x224 and max 8000x8000. Aspect ratio > 20:1 rejected to prevent degenerate/adversarial inference loops.
*   **Upload Mechanism:** S3 Presigned PUT URLs generated by Lambda. 5-minute TTL. Restricted to `image/jpeg` and `image/png`.
*   **SSRF Protection:** Any URL ingestion (if supported later) strictly rejects private IPs (`10.*, 192.168.*, 127.*, 169.254.*`) and allows only known CDNs.

### 4.5 Data Protection
*   **Zero PII:** User identifiers are heavily hashed: `uploader_id = SHA-256(User-Agent + truncated IP + hour-truncated timestamp)`.
*   **Database Encryption:** RDS encrypted at rest (KMS). SSL-only connections enforced (`rds.force_ssl=1`). Minimum TLS 1.2.
*   **Secrets Management:** All secrets (DB URLs, API keys) stored in AWS Systems Manager (SSM) Parameter Store as `SecureString`. Fetched dynamically at Lambda cold start and cached in memory for the lifecycle of the container. No `.env` files in production images.

---

## 5. Machine Learning Guardrails

Protecting the model from drift, poisoning, and catastrophic forgetting.

*   **Output Constraints:** Confidence threshold min 0.20, max detections per image: 50. Configurable via SSM without re-deploying code.
*   **Immutable Artifacts:** Model weights and datasets in S3 use Object Lock (COMPLIANCE mode). They cannot be deleted or overwritten by anyone (even Root) for the retention period.
*   **Deployment Gate:** Models NEVER auto-deploy. An admin must click "Promote".
*   **Automated Regression Check:** Before the "Promote" button is even enabled, the system evaluates the new model. If overall mAP50 drops > 5% OR any single class drops > 5%, the deploy is blocked.
*   **Data Poisoning Protection:** Only images with `approved` or `corrected` labels enter the training set. `skipped` images are permanently excluded.
*   **Audit Trail:** Soft deletes only on labels. `created_by` and `created_at` logged on every correction (non-repudiable).
*   **Canary Deployment:** When promoted, the model goes to `canary_traffic_pct=10`. It serves 10% of real traffic for 1 hour. If Lambda/Inference error rates remain baseline, it auto-promotes to 100%.

---

## 6. Database Schema (PostgreSQL 16)

The schema utilizes UUID primary keys, JSONB for dynamic bounding boxes, and geospatial indexes for recycler lookups.

```sql
CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    s3_key TEXT NOT NULL,
    s3_url TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    uploader_id TEXT NOT NULL,
    width INT NOT NULL,
    height INT NOT NULL,
    review_status TEXT CHECK (review_status IN ('pending', 'approved', 'corrected', 'skipped')) DEFAULT 'pending'
);
CREATE INDEX idx_images_review_status ON images(review_status);

CREATE TABLE detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID REFERENCES images(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    bbox JSONB NOT NULL, -- {x1, y1, x2, y2}
    model_ver TEXT NOT NULL,
    detected_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_detections_image ON detections(image_id);
-- Note: detections is IMMUTABLE append-only.

CREATE TABLE labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID REFERENCES images(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,
    bbox JSONB NOT NULL, -- {xc, yc, w, h} (YOLO format)
    source TEXT CHECK (source IN ('model', 'admin', 'import')),
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOL DEFAULT TRUE
);
CREATE INDEX idx_labels_image_active ON labels(image_id, is_active);

CREATE TABLE training_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modal_run_id TEXT NOT NULL,
    triggered_by TEXT NOT NULL,
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT CHECK (status IN ('queued', 'running', 'done', 'failed')) DEFAULT 'queued',
    epochs INT NOT NULL,
    dataset_images INT,
    metrics JSONB, -- Loss curves, etc.
    completed_at TIMESTAMPTZ
);

CREATE TABLE model_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES training_runs(id),
    s3_key TEXT NOT NULL,
    s3_object_lock_token TEXT,
    map50 FLOAT,
    map50_95 FLOAT,
    per_class JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deployed_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    approved_by TEXT,
    canary_traffic_pct INT DEFAULT 0
);

CREATE TABLE recyclers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    lat FLOAT NOT NULL,
    lng FLOAT NOT NULL,
    phone TEXT,
    cpcb_reg_no TEXT,
    accepts TEXT[],
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_recyclers_geo ON recyclers(lat, lng);
```

---

## 7. Continuous Learning Loop Lifecycle

The system improves automatically via HITL pipelines:

1.  **Ingestion:** Kabadiwala uploads image → Cloudflare Workers proxy → API GW → `ebroker-api` Lambda.
2.  **Pre-processing:** Lambda validates (magic bytes, size, constraints), strips EXIF, uploads to S3, creates `images` record (status: pending).
3.  **Decoupling:** Lambda sends SQS message (`ebroker-inference-queue`).
4.  **Inference:** Modal serverless (A10G) polls SQS, runs YOLO26 inference, returns detections via API to `ebroker-internal`.
5.  **Agent Augmentation:** Detections saved to DB. Strands agent runs pricing, toxicity, and EPR logic in parallel.
6.  **Human Review:** Admin reviews `pending` queue in UI. Clicks "Approve" (converts detection to `is_active=true` label) or "Correct" (redraws bbox, saves as admin label).
7.  **Trigger:** Nightly cron (EventBridge → Lambda) checks `SELECT count(*) FROM images WHERE review_status IN ('approved','corrected') AND uploaded_at > last_train_time`. If >= 200, spawns Modal training job.
8.  **Training:** Modal calls `export_dataset()` (pulls from S3/DB), runs the YOLO26 training function, generates metrics. Pushes to `/internal/training/metrics` webhook.
9.  **Model Packaging:** Metrics stored in `training_runs`. `model_versions` created with `s3_object_lock_token`.
10. **Regression Gate:** Admin reviews `/admin/models`. UI queries per-class mAP50 delta. If drop > 5%, deploy button disabled.
11. **Canary Promotion:** Admin approves. `ebroker-admin` Lambda sets `canary_traffic_pct=10`. Monitors CloudWatch alarms for 1 hour. Auto-promotes to 100%, updates `canary_traffic_pct` of old model to 0.

---

## 8. Strands AI Agent Integration

The Strands agent (powered by Amazon Nova Pro on Bedrock `us-east-1`) uses function calling to provide domain expertise based on YOLO26 detections.

**Registered Tools:**
1.  `get_scrap_price(class_name, region)`: Queries commodities API.
2.  `assess_toxicity(class_name)`: Queries static RoHS/WEEE compliance tables (e.g., Lead in CRTs).
3.  `generate_epr_passport(detections, uploader_id)`: Generates ReportLab PDF tracking certificate, uploads to S3, returns presigned URL.
4.  `find_recyclers(lat, lng, radius_km)`: DB geo-query against `recyclers` table using Haversine formula.
5.  `get_exchange_rate(currency)`: Real-time INR conversion.

---

## 9. IAM: Least Privilege

*   **`ebroker-api-role` (Public Lambda):**
    *   `s3:PutObject` strictly on `arn:aws:s3:::ebroker-bucket/images/*`
    *   `ssm:GetParameter` strictly on `/ebroker/public/*`
    *   `sqs:SendMessage` on `ebroker-inference-queue`
    *   `logs:*`, `xray:PutTraceSegments`
    *   **NO** RDS direct access (uses Proxy with IAM Auth).
*   **`ebroker-admin-role` (Admin Lambda):**
    *   `s3:GetObject` on `models/*`
    *   `rds-proxy:*`
    *   `ssm:GetParameter` on `/ebroker/*`
*   **`ebroker-internal-role` (Webhook Lambda):**
    *   `s3:PutObject` on `models/*`
    *   `rds-proxy:*`
*   **Database Access:** IAM Authentication is enabled on RDS Proxy. No raw DB passwords exist in Lambda environment variables.

---

## 10. Observability & Monitoring

*   **Structured Logging:** All Lambdas output JSON. Format:
    `{"timestamp", "level", "request_id", "endpoint", "duration_ms", "status_code", "user_agent_hash"}`
*   **AWS X-Ray:** Distributed tracing enabled. Generates service map: `CF Pages -> API GW -> Lambda -> SQS -> Modal`.
*   **CloudWatch Alarms:**
    *   Lambda error rate > 1% (5 mins)
    *   Lambda P95 latency > 5s
    *   RDS CPU > 80%
    *   WAF Blocks > 1000 / 5min
*   **Cost Management:** AWS Cost Anomaly Detection enabled. Alerts via SNS if daily spend deviates > $5 from ML baseline.
*   **CloudWatch Dashboard:** Displays Request/Min, Inference Latency (P50/P95), Active Training Status, and YOLO mAP50 trend over time.

---

## 11. Local Development Environment

The dev environment uses Floci (MIT drop-in for LocalStack) to achieve 24ms startup times for local AWS emulation.

### 11.1 docker-compose.yaml

```yaml
version: '3.8'
services:
  floci:
    image: floci/floci:latest
    ports:
      - "4566:4566"
    environment:
      - SERVICES=s3,ssm,sqs,cognito-idp
      - DEFAULT_REGION=ap-south-1
  
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: ebroker
      POSTGRES_PASSWORD: localpassword
      POSTGRES_DB: ebroker_local
    volumes:
      - pgdata:/var/lib/postgresql/data

  app:
    build: 
      context: ./src
      dockerfile: Dockerfile.dev
    ports:
      - "8000:8000"
    volumes:
      - ./src:/app
    environment:
      - ENV=local
      - AWS_ENDPOINT_URL=http://floci:4566
    depends_on:
      - floci
      - postgres
    command: uvicorn main:app --host 0.0.0.0 --reload

volumes:
  pgdata:
```

### 11.2 Makefile Targets
```makefile
up:
	docker-compose up -d

down:
	docker-compose down -v

test:
	pytest tests/ -v

db-migrate:
	alembic upgrade head

sam-local:
	sam local start-api --env-vars .env.local.json --docker-network ebroker_default
```

### 11.3 .env.local Template
```env
# .env.local
DB_URL=postgresql://ebroker:localpassword@localhost:5432/ebroker_local
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_ENDPOINT_URL=http://localhost:4566
```

### 11.4 testcontainers-floci (Python Example)
```python
# tests/conftest.py
import pytest
from testcontainers.core.container import DockerContainer

@pytest.fixture(scope="session")
def floci_container():
    floci = DockerContainer("floci/floci:latest").with_exposed_ports(4566)
    floci.with_env("SERVICES", "s3,sqs")
    with floci as container:
        yield container
```

---

## 12. Infrastructure as Code (IaC) Structure

```text
infra/
├── terraform/         
│   ├── vpc.tf            (3-tier subnets, NAT GW, endpoints)
│   ├── rds.tf            (PostgreSQL, Proxy, Parameter Group)
│   ├── s3.tf             (Buckets, Object Lock, Lifecycle)
│   ├── cognito.tf        (User Pool, App Client)
│   ├── waf.tf            (Rate limits, AWS Managed Rules)
│   ├── ssm.tf            (Parameter definitions)
│   ├── ecr.tf            (Container registries)
│   ├── sqs.tf            (Inference Queue)
│   ├── cloudtrail.tf     (Audit logging)
│   ├── variables.tf      
│   └── outputs.tf        
├── sam/               
│   ├── template.yaml     (API GW, Lambda Functions)
│   └── samconfig.toml    
└── cloudflare/        
    ├── wrangler.toml     (Pages + Workers config)
    └── workers/          
        └── api-proxy.js  (Thin proxy logic)
```

### 12.1 AWS SAM snippet (`template.yaml`)

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  EbrokerApiGateway:
    Type: AWS::Serverless::HttpApi
    Properties:
      Auth:
        Authorizers:
          CognitoAuthorizer:
            IdentitySource: $request.header.Authorization
            JwtConfiguration:
              issuer: !Sub "https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPoolId}"
              audience:
                - !Ref UserPoolClientId

  EbrokerApiFunction:
    Type: AWS::Serverless::Function
    Properties:
      PackageType: Image
      MemorySize: 512
      Timeout: 30
      Architectures:
        - arm64
      VpcConfig:
        SecurityGroupIds:
          - !Ref LambdaSecurityGroup
        SubnetIds:
          - !Ref PrivateSubnet1
          - !Ref PrivateSubnet2
      Events:
        ApiEvent:
          Type: HttpApi
          Properties:
            Path: /api/{proxy+}
            Method: ANY
            ApiId: !Ref EbrokerApiGateway
      Policies:
        - SQSSendMessagePolicy:
            QueueName: !Ref InferenceQueue
```

### 12.2 Cloudflare `wrangler.toml`

```toml
name = "ebroker-frontend"
compatibility_date = "2024-03-20"
pages_build_output_dir = ".vercel/output/static"

[vars]
AWS_API_GATEWAY_URL = "https://xxxxxx.execute-api.ap-south-1.amazonaws.com"

[[routes]]
pattern = "/api/*"
script = "api-proxy"
```

### 12.3 Terraform VPC Snippet (`vpc.tf`)

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"

  name = "ebroker-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["ap-south-1a", "ap-south-1b"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.11.0/24", "10.0.12.0/24"]
  database_subnets = ["10.0.21.0/24", "10.0.22.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = false # Multi-AZ for high availability
  one_nat_gateway_per_az = true
  
  create_database_subnet_group           = true
  create_database_subnet_route_table     = true
  create_database_internet_gateway_route = false # ISOLATED

  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id       = module.vpc.vpc_id
  service_name = "com.amazonaws.ap-south-1.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = module.vpc.private_route_table_ids
}
```

---
*End of Architecture Document.*
