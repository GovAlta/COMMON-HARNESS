-- Seed: 004_seed_form_definitions.sql
-- Truncates existing forms and inserts the canonical reference form.
-- This ensures a clean slate on every seed run.

-- Clear existing submissions first (FK dependency), then forms
TRUNCATE TABLE form_submission CASCADE;
TRUNCATE TABLE form_definition CASCADE;

-- Sample Services Application — comprehensive reference form
-- Uses canonical schema format: top-level `fields` array + steps with field name refs
-- All field types use standard FormKit type names
INSERT INTO form_definition (
  pk_form_definition,
  form_name,
  form_version_number,
  form_schema,
  form_description,
  is_published,
  is_deleted
) VALUES (
  '88888888-0001-0001-0001-000000000005',
  'Sample Services Application',
  1,
  '{
    "title": "Sample Services Application",
    "description": "Comprehensive sample application form. Demonstrates all available field types and validation options.",
    "steps": [
      {
        "title": "Personal Information",
        "description": "Please provide your personal details. Fields marked with * are required.",
        "fields": [
          "full_name", "email_address", "phone_number", "date_of_birth",
          "home_address", "city", "postal_code", "province"
        ]
      },
      {
        "title": "Application Details",
        "description": "Tell us about your application and the services you need.",
        "fields": [
          "service_category", "service_category_other", "priority_level",
          "preferred_contact", "preferred_time", "estimated_budget",
          "application_date", "additional_notes"
        ]
      },
      {
        "title": "Agreements & Upload",
        "description": "Review the agreements and upload any supporting documents.",
        "fields": [
          "agree_terms", "receive_updates", "accessibility_needs",
          "document_upload", "website_reference", "color_preference"
        ]
      }
    ],
    "fields": [
      {
        "name": "full_name",
        "type": "text",
        "label": "Full Legal Name",
        "placeholder": "e.g., Jane Marie Smith",
        "required": true,
        "helpText": "Enter your full name as it appears on your government-issued ID.",
        "validation": {
          "minLength": 2,
          "maxLength": 100
        }
      },
      {
        "name": "email_address",
        "type": "email",
        "label": "Email Address",
        "placeholder": "you@example.com",
        "required": true,
        "helpText": "We will use this email for all correspondence."
      },
      {
        "name": "phone_number",
        "type": "tel",
        "label": "Phone Number",
        "placeholder": "780-555-0100",
        "required": true,
        "helpText": "Phone number including area code.",
        "validation": {
          "pattern": "^[0-9]{3}-?[0-9]{3}-?[0-9]{4}$"
        }
      },
      {
        "name": "date_of_birth",
        "type": "date",
        "label": "Date of Birth",
        "required": true,
        "helpText": "You must be 18 or older to apply."
      },
      {
        "name": "home_address",
        "type": "textarea",
        "label": "Home Address",
        "placeholder": "Street address, apartment, unit, etc.",
        "required": true,
        "helpText": "Your current residential address.",
        "validation": {
          "maxLength": 500
        }
      },
      {
        "name": "city",
        "type": "text",
        "label": "City",
        "placeholder": "e.g., Edmonton",
        "required": true
      },
      {
        "name": "postal_code",
        "type": "text",
        "label": "Postal Code",
        "placeholder": "T5K 2G6",
        "required": true,
        "helpText": "Canadian postal code format (e.g., T5K 2G6).",
        "validation": {
          "pattern": "^[A-Za-z]\\d[A-Za-z]\\s?\\d[A-Za-z]\\d$"
        }
      },
      {
        "name": "province",
        "type": "select",
        "label": "Province / Territory",
        "required": true,
        "options": [
          {"label": "AB", "value": "AB"},
          {"label": "British Columbia", "value": "BC"},
          {"label": "Saskatchewan", "value": "SK"},
          {"label": "Manitoba", "value": "MB"},
          {"label": "Ontario", "value": "ON"},
          {"label": "Quebec", "value": "QC"},
          {"label": "Nova Scotia", "value": "NS"},
          {"label": "New Brunswick", "value": "NB"},
          {"label": "Newfoundland and Labrador", "value": "NL"},
          {"label": "Prince Edward Island", "value": "PE"},
          {"label": "Northwest Territories", "value": "NT"},
          {"label": "Nunavut", "value": "NU"},
          {"label": "Yukon", "value": "YT"}
        ]
      },
      {
        "name": "service_category",
        "type": "select",
        "label": "Service Category",
        "required": true,
        "helpText": "Select the category that best describes the service you need.",
        "options": [
          {"label": "Health Services", "value": "health"},
          {"label": "Education & Training", "value": "education"},
          {"label": "Financial Assistance", "value": "financial"},
          {"label": "Housing & Shelter", "value": "housing"},
          {"label": "Employment Services", "value": "employment"},
          {"label": "Community & Social", "value": "community"},
          {"label": "Other", "value": "other"}
        ]
      },
      {
        "name": "service_category_other",
        "type": "text",
        "label": "Other Category Description",
        "placeholder": "Please describe the service you need",
        "required": false,
        "helpText": "Provide details if you selected Other above.",
        "conditional": {
          "field": "service_category",
          "value": "other",
          "operator": "equals"
        }
      },
      {
        "name": "priority_level",
        "type": "radio",
        "label": "How urgent is your request?",
        "required": true,
        "options": [
          {"label": "Routine — no rush, within normal processing times", "value": "routine"},
          {"label": "Urgent — needed within 2 weeks", "value": "urgent"},
          {"label": "Emergency — immediate need, health or safety concern", "value": "emergency"}
        ]
      },
      {
        "name": "preferred_contact",
        "type": "checkbox",
        "label": "Preferred Contact Methods",
        "helpText": "Select all that apply. We will use these methods to reach you.",
        "options": [
          {"label": "Email", "value": "email"},
          {"label": "Phone", "value": "phone"},
          {"label": "Text Message (SMS)", "value": "sms"},
          {"label": "Postal Mail", "value": "mail"}
        ]
      },
      {
        "name": "preferred_time",
        "type": "time",
        "label": "Preferred Contact Time",
        "helpText": "What time of day is best to reach you?"
      },
      {
        "name": "estimated_budget",
        "type": "number",
        "label": "Estimated Annual Household Income ($)",
        "placeholder": "e.g., 50000",
        "helpText": "This helps us determine eligibility for income-based programs.",
        "validation": {
          "min": 0,
          "max": 999999
        }
      },
      {
        "name": "application_date",
        "type": "date",
        "label": "Preferred Start Date",
        "helpText": "When would you like the service to begin?"
      },
      {
        "name": "additional_notes",
        "type": "textarea",
        "label": "Additional Information",
        "placeholder": "Any other details that may help us process your application...",
        "helpText": "Include any special circumstances, accessibility needs, or relevant background.",
        "validation": {
          "maxLength": 2000
        }
      },
      {
        "name": "agree_terms",
        "type": "checkbox",
        "label": "I agree to the Terms of Service and Privacy Policy",
        "required": true,
        "helpText": "You must agree to the terms to submit this application."
      },
      {
        "name": "receive_updates",
        "type": "checkbox",
        "label": "I would like to receive updates about programs and services"
      },
      {
        "name": "accessibility_needs",
        "type": "radio",
        "label": "Do you require accessibility accommodations?",
        "options": [
          {"label": "No accommodations needed", "value": "none"},
          {"label": "Visual accommodations (large print, screen reader compatible)", "value": "visual"},
          {"label": "Hearing accommodations (sign language, captioning)", "value": "hearing"},
          {"label": "Mobility accommodations (wheelchair access, home visit)", "value": "mobility"},
          {"label": "Language accommodations (translation, interpretation)", "value": "language"},
          {"label": "Other — please describe in additional notes above", "value": "other"}
        ]
      },
      {
        "name": "document_upload",
        "type": "file",
        "label": "Supporting Documents",
        "helpText": "Upload government ID, proof of address, or other relevant documents. Accepted: PDF, JPEG, PNG (max 10MB)."
      },
      {
        "name": "website_reference",
        "type": "url",
        "label": "Website or Online Profile (optional)",
        "placeholder": "https://",
        "helpText": "If applicable, provide a link to a relevant website or profile."
      },
      {
        "name": "color_preference",
        "type": "color",
        "label": "Preferred Badge Color (optional)",
        "helpText": "Choose a color for your service ID badge. This is optional."
      }
    ]
  }',
  'Comprehensive sample application form. Demonstrates all field types including text, email, phone, date, time, select, radio, checkbox, textarea, number, file upload, URL, and color picker. Multi-step with validation, conditional fields, and required field indicators.',
  true,
  false
);
