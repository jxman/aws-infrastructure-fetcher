# SNS Notifications Setup Guide

Your Lambda function is now configured with SNS notifications for both **success** and **error** scenarios!

## Quick Setup - Subscribe Your Email

To receive notifications, subscribe your email address to the SNS topic:

```bash
# Replace YOUR_EMAIL@example.com with your actual email
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:600424110307:aws-data-fetcher-notifications \
  --protocol email \
  --notification-endpoint YOUR_EMAIL@example.com
```

**Important**: You'll receive a confirmation email from AWS. **Click the "Confirm subscription" link** in that email to activate notifications.

## Verify Subscription

```bash
# Check your subscriptions
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:600424110307:aws-data-fetcher-notifications
```

## What You'll Receive

### ✅ Success Notifications

Sent after every successful Lambda execution with:

- Regions discovered
- Services discovered
- Execution duration
- S3 file paths
- Cache statistics

### ❌ Error Notifications

Sent when Lambda encounters errors with:

- Error message and type
- Stack trace
- Duration before failure
- Direct link to CloudWatch Logs

### ⚠️ CloudWatch Alarms

Sent when alarms trigger:

- Error alarm: Any Lambda execution error
- Duration alarm: Execution exceeds 2 minutes

## Testing Notifications

### Test Success Notification

```bash
# Run the Lambda function
aws lambda invoke \
  --function-name aws-data-fetcher \
  --cli-binary-format raw-in-base64-out \
  --payload '{"includeServiceMapping":true}' \
  response.json

# Check your email for success notification
```

### Test Error Notification

You can temporarily trigger an error by invoking with invalid options, or wait for a natural error to occur.

## Managing Notifications

### Unsubscribe from Email

Use the unsubscribe link at the bottom of any notification email, or:

```bash
# List subscriptions to get the subscription ARN
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:600424110307:aws-data-fetcher-notifications

# Unsubscribe using the subscription ARN
aws sns unsubscribe --subscription-arn arn:aws:sns:us-east-1:SUBSCRIPTION_ARN
```

### Add Additional Email Addresses

```bash
# Subscribe another email
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:600424110307:aws-data-fetcher-notifications \
  --protocol email \
  --notification-endpoint another-email@example.com
```

### Subscribe SMS (Optional)

```bash
# Subscribe via SMS
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:600424110307:aws-data-fetcher-notifications \
  --protocol sms \
  --notification-endpoint +1234567890
```

## Notification Examples

### Success Email

```
Subject: ✅ AWS Data Fetcher Success - 13s

AWS Data Fetcher completed successfully!

Summary:
- Regions: 38
- Services: 394
- Duration: 13s
- Request ID: abc-123-def

S3 Paths:
- Regions: s3://aws-data-fetcher-output/aws-data/regions.json
- Services: s3://aws-data-fetcher-output/aws-data/services.json
- Complete: s3://aws-data-fetcher-output/aws-data/complete-data.json

Service Mapping:
- Total Regions: 38
- Average Services per Region: 227
- Cached Regions: 38
- Fetched Regions: 0
```

### Error Email

```
Subject: ❌ AWS Data Fetcher Error - AccessDeniedException

AWS Data Fetcher execution failed!

Error: User is not authorized to perform: ssm:GetParameter

Details:
- Request ID: abc-123-def
- Duration before failure: 5s
- Error Type: AccessDeniedException

Stack Trace:
[Full stack trace here]

Please check CloudWatch Logs for more details:
[Direct link to logs]
```

## Troubleshooting

### Not Receiving Emails?

1. **Check spam folder** - AWS emails may be filtered
2. **Verify subscription status**: Must be "Confirmed" (not "PendingConfirmation")
3. **Check email address**: Ensure no typos in subscription command

### Confirm Subscription Link Expired?

```bash
# Resubscribe
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:600424110307:aws-data-fetcher-notifications \
  --protocol email \
  --notification-endpoint YOUR_EMAIL@example.com
```

### Too Many Notifications?

- Success notifications sent on every execution (daily at 2 AM UTC + manual invocations)
- To reduce noise, you can unsubscribe from success notifications and only keep error alerts
- Or adjust the EventBridge schedule to run less frequently

## Architecture

```
┌─────────────────┐
│  Lambda         │
│  aws-data-      │──Success──┐
│  fetcher        │           │
└─────────────────┘           │
        │                     │
        │ Error               │
        │                     ▼
        ▼              ┌─────────────────┐
┌─────────────────┐   │  SNS Topic      │
│  CloudWatch     │──▶│  aws-data-      │
│  Alarms         │   │  fetcher-       │
└─────────────────┘   │  notifications  │
                      └─────────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
            Email-1      Email-2       SMS
```

## Cost

SNS costs are minimal:

- First 1,000 email notifications: FREE
- After 1,000: $2 per 100,000 emails
- Daily execution = ~30 notifications/month = **FREE**

## Next Steps

1. **Subscribe your email** using the command above
2. **Confirm subscription** via the email link
3. **Test** by invoking the Lambda function
4. **Enjoy automated notifications**! 📧

---

For more information, see:

- [AWS SNS Documentation](https://docs.aws.amazon.com/sns/)
- [CloudWatch Alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)
