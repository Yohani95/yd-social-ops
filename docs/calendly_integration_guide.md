
# Calendly API Integration Documentation
## Guide for SaaS Platforms (Omnichannel Automation / Scheduling Bots)

This document summarizes the Calendly Developer Documentation, focusing on how to integrate Calendly into a multi-tenant SaaS platform such as an automation platform with bots, CRM, and omnichannel messaging.

Example use cases:
- Chatbots that schedule meetings
- CRM synchronization with meetings
- Automated booking flows
- Appointment scheduling inside messaging channels

---

# 1. API Overview

Calendly provides an API that allows applications to:
- read scheduling data
- retrieve availability
- create events
- receive webhook notifications

Base API URL:
https://api.calendly.com

Authentication header:
Authorization: Bearer ACCESS_TOKEN

Main integration components:
- OAuth 2.0 authentication
- REST API access
- Webhooks for event notifications

---

# 2. OAuth Authentication

For SaaS applications with multiple users or tenants, OAuth is required.

Authorization endpoint:
https://auth.calendly.com/oauth/authorize

Token endpoint:
https://auth.calendly.com/oauth/token

OAuth Flow:
1. User connects their Calendly account
2. Calendly redirects with `authorization_code`
3. Backend exchanges code for `access_token`
4. Backend stores `access_token` and `refresh_token`
5. API requests are made using the token

Required parameters:
- client_id
- client_secret
- grant_type
- code
- redirect_uri

---

# 3. OAuth Scopes

Scopes define what permissions your application receives.

Recommended scopes for scheduling integrations:

default
users:read
event_types:read
events:read
webhook_subscriptions:write

Scope descriptions:

| Scope | Purpose |
|------|------|
| default | Basic API access |
| users:read | Retrieve authenticated user information |
| event_types:read | Retrieve meeting types |
| events:read | Retrieve scheduled events |
| webhook_subscriptions:write | Create webhook subscriptions |

---

# 4. Core API Resources

| Endpoint | Description |
|------|------|
| /users/me | Retrieve authenticated user |
| /event_types | Retrieve available meeting types |
| /scheduled_events | Retrieve scheduled meetings |
| /event_type_available_times | Retrieve availability |
| /webhook_subscriptions | Create webhook subscriptions |

---

# 5. Integration Workflow

## Step 1 — Retrieve User
GET /users/me

Response contains:
- user_uri
- organization_uri

The `user_uri` is required for other API calls.

## Step 2 — Retrieve Event Types
GET /event_types?user={user_uri}

Example response:
- 30 min meeting
- Consultation
- Sales demo

Each event type includes `scheduling_uri`.

## Step 3 — Retrieve Availability
GET /event_type_available_times

Required parameters:
- event_type
- start_time
- end_time

Important limitation:
Calendly allows querying availability only within a **7-day window**.

## Step 4 — Create Scheduled Event
POST /scheduled_events

Use cases:
- scheduling bots
- automated booking flows
- CRM integrations
- AI assistants

---

# 6. Webhooks

Webhooks notify your system when scheduling events occur.

Common webhook events:
- invitee.created
- invitee.canceled
- invitee.rescheduled

Create webhook subscription:
POST /webhook_subscriptions

Calendly will send event notifications to your webhook endpoint.

Example webhook workflow:
1. User books meeting
2. Calendly sends webhook
3. Your system processes event
4. CRM updates meeting status

---

# 7. Retrieving Full Event Data

Webhook payloads may contain limited information.

To retrieve full event data:
GET /scheduled_events/{uuid}

Retrieve invitee information:
GET /scheduled_events/{uuid}/invitees

This ensures the system has complete scheduling data.

---

# 8. Supported Use Cases

Calendly API enables multiple integration patterns:

### Chatbot scheduling
Bots can retrieve availability and schedule meetings.

### CRM synchronization
Meeting information can be stored in a CRM system.

### Automated workflows
Actions triggered after meeting scheduling.

### Scheduling assistants
AI assistants that help users book meetings.

---

# 9. API Limitations

Calendly API cannot modify all scheduling configurations.

Not supported:
- creating event types
- modifying availability rules
- changing scheduling settings

These must be configured in the Calendly dashboard.

The API focuses mainly on:
- reading scheduling data
- retrieving availability
- creating events
- receiving webhooks

---

# 10. Recommended SaaS Architecture

Suggested architecture for scheduling automation platforms:

User connects Calendly  
→ OAuth Authentication  
→ Access token stored per tenant  
→ Retrieve event types  
→ Retrieve availability  
→ User selects time slot  
→ Create scheduled event  
→ Webhook confirms meeting  
→ CRM stores meeting

---

# 11. Example Bot Scheduling Flow

Customer message:
"I want to schedule a meeting"

Bot workflow:
1. Retrieve available event types
2. Retrieve available times
3. Display time slots
4. User selects time
5. Create scheduled event
6. Receive webhook confirmation
7. Store meeting in CRM

---

# 12. Recommended Scopes for Automation Platforms

default  
users:read  
event_types:read  
events:read  
webhook_subscriptions:write

These scopes allow building:
- scheduling bots
- appointment CRM
- booking automation
- confirmation workflows
- reminders and follow‑up automation

---

# 13. Integration Strategy for Omnichannel Platforms

Calendly can integrate with:
- WhatsApp
- Instagram
- Messenger
- Web chat

Typical flow:

Customer requests appointment  
→ Bot retrieves availability  
→ Bot suggests time slots  
→ User selects time  
→ System creates meeting  
→ Webhook confirms booking  
→ CRM stores appointment

---

# 14. Summary

Calendly API enables SaaS platforms to build scheduling automation features.

Key capabilities:
- OAuth authentication
- availability retrieval
- meeting scheduling
- webhook notifications

Main limitation:
Scheduling configuration must be managed in the Calendly UI.

Ideal for:
- appointment booking bots
- CRM meeting synchronization
- automated scheduling workflows
- AI‑driven scheduling assistants
