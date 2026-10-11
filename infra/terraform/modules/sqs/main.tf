# SQS module - FIFO inference queue (+ DLQ)
resource "aws_sqs_queue" "inference_dlq" {
  name = "${var.project}-inference-dlq.fifo"
  fifo_queue = true
}

resource "aws_sqs_queue" "inference" {
  name                        = "${var.project}-inference.fifo"
  fifo_queue                  = true
  content_based_deduplication = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.inference_dlq.arn
    maxReceiveCount     = 3
  })
}
