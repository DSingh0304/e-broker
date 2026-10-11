# E-Broker Bedrock access — Strands agent (Nova Pro) invoke-only.
# Lambda execution roles are SAM-managed (infra/sam/template.yaml);
# this managed policy documents the least-privilege grant and can be
# attached to the SAM-created role via the role name/output.
resource "aws_iam_policy" "bedrock_nova_invoke" {
  name = "${var.project}-bedrock-nova-invoke"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "BedrockNovaProInvokeOnly"
      Effect = "Allow"
      Action = [
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:InvokeModel",
      ]
      Resource = [
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0",
        "arn:aws:bedrock:us-east-1::foundation-model/us.amazon.nova-pro-v1:0",
      ]
    }]
  })
}
