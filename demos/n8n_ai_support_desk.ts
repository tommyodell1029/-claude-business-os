import { workflow, node, trigger, sticky, placeholder, languageModel, outputParser, ifElse, expr, nodeJson } from '@n8n/workflow-sdk';

const KB = 'BUSINESS KNOWLEDGE BASE (fictional demo business: Brightside Home Cleaning, Jacksonville FL)\n' +
  '- Services: standard clean, deep clean, move-in/move-out clean. No carpet shampooing, no window exteriors.\n' +
  '- Prices: standard clean from $120 (up to 2 bedrooms), deep clean from $220, move-out from $260. Final quote after a short photo walkthrough.\n' +
  '- Hours: Mon-Sat 8am-6pm. Closed Sundays and public holidays.\n' +
  '- Booking: online at brightside.example/book or by replying to this email with preferred date and address.\n' +
  '- Rescheduling: free with 24h notice. Less than 24h notice: $40 fee.\n' +
  '- Cancellations: full refund with 48h notice.\n' +
  '- Supplies: we bring all supplies; eco-friendly products on request at no charge.\n' +
  '- Service area: Jacksonville, Jacksonville Beach, Orange Park, St. Johns.\n' +
  '- Damage policy: fully insured; report issues within 48h with photos.\n';

const RULES = 'Rules: answer ONLY from the knowledge base. Never invent prices, policies, dates or availability. ' +
  'If the knowledge base does not fully answer the question, set can_answer to false and do not guess. ' +
  'Tone: warm, concise, plain text, no markdown, sign off as "The Brightside Team".';

const gmailCred = { gmailOAuth2: { id: 'LHH0Oh7O2tdrtDPh', name: 'Gmail account' } };
const claudeCred = { anthropicApi: { id: '4UQs2Ua0Cpr4Mmoz', name: 'Anthropic account' } };
const haiku = { __rl: true, mode: 'id', value: 'claude-haiku-4-5-20251001' };

const newEmail = trigger({
  type: 'n8n-nodes-base.gmailTrigger',
  version: 1.4,
  config: {
    name: 'New Inbox Email',
    parameters: {
      pollTimes: { item: [{ mode: 'everyX', value: 5, unit: 'minutes' }] },
      simple: false,
      maxResults: 5,
      filters: { q: 'in:inbox newer_than:2d -label:ai-triaged -category:promotions -category:social', readStatus: 'unread' },
      options: { downloadAttachments: false }
    },
    credentials: gmailCred,
    position: [0, 300]
  },
  output: [{ id: '19a1b2c3', threadId: '19a1b2c3', subject: 'Question about deep clean', text: 'Hi, how much is a deep clean for a 3 bed house?', from: { value: [{ address: 'customer@example.com', name: 'Sam' }] } }]
});

const normalizeEmail = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalize Email',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'n1', name: 'messageId', value: expr('{{ $json.id }}'), type: 'string' },
          { id: 'n2', name: 'threadId', value: expr('{{ $json.threadId }}'), type: 'string' },
          { id: 'n3', name: 'sender', value: expr('{{ $json.from?.value?.[0]?.address ?? "" }}'), type: 'string' },
          { id: 'n4', name: 'senderName', value: expr('{{ $json.from?.value?.[0]?.name ?? "" }}'), type: 'string' },
          { id: 'n5', name: 'subject', value: expr('{{ $json.subject ?? "(no subject)" }}'), type: 'string' },
          { id: 'n6', name: 'body', value: expr('{{ ($json.text ?? $json.snippet ?? "").slice(0, 4000) }}'), type: 'string' }
        ]
      }
    },
    position: [240, 300]
  },
  output: [{ messageId: '19a1b2c3', threadId: '19a1b2c3', sender: 'customer@example.com', senderName: 'Sam', subject: 'Question about deep clean', body: 'Hi, how much is a deep clean for a 3 bed house?' }]
});

const classifierModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.6,
  config: { name: 'Claude Haiku (Classifier)', parameters: { model: haiku, options: { temperature: 0, maxTokensToSample: 300 } }, credentials: claudeCred, position: [480, 520] }
});

const classifyEmail = node({
  type: '@n8n/n8n-nodes-langchain.textClassifier',
  version: 1.1,
  config: {
    name: 'Is It Support?',
    parameters: {
      inputText: expr('From: {{ $json.sender }}\nSubject: {{ $json.subject }}\n\n{{ $json.body }}'),
      categories: {
        categories: [
          { category: 'support_request', description: 'A customer or prospect asking a question, requesting help, booking, rescheduling, cancelling, or reporting a problem with the service.' },
          { category: 'not_support', description: 'Newsletters, receipts, notifications, sales pitches, spam, internal mail, or anything that is not a customer asking for help.' }
        ]
      },
      options: { fallback: 'other' }
    },
    subnodes: { model: classifierModel },
    retryOnFail: true,
    maxTries: 3,
    position: [480, 300]
  },
  output: [{ messageId: '19a1b2c3', threadId: '19a1b2c3', sender: 'customer@example.com', senderName: 'Sam', subject: 'Question about deep clean', body: 'Hi, how much is a deep clean for a 3 bed house?' }]
});

const answerModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.6,
  config: { name: 'Claude Haiku (Answer)', parameters: { model: haiku, options: { temperature: 0.2, maxTokensToSample: 800 } }, credentials: claudeCred, position: [760, 520] }
});

const answerSchema = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'Answer Format',
    parameters: { schemaType: 'fromJson', jsonSchemaExample: '{ "can_answer": true, "reply": "Hi Sam, a deep clean starts at $220...", "reasoning": "Price for deep clean is in the knowledge base" }' },
    position: [900, 520]
  }
});

const draftAnswer = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: {
    name: 'Answer From Knowledge Base',
    parameters: {
      promptType: 'define',
      text: expr('Customer email\nFrom: {{ $json.senderName }} <{{ $json.sender }}>\nSubject: {{ $json.subject }}\n\n{{ $json.body }}'),
      hasOutputParser: true,
      messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: 'You write replies to customer support emails.\n\n' + KB + '\n' + RULES }] }
    },
    subnodes: { model: answerModel, outputParser: answerSchema },
    retryOnFail: true,
    maxTries: 3,
    position: [760, 200]
  },
  output: [{ output: { can_answer: true, reply: 'Hi Sam, thanks for reaching out! A deep clean starts at $220...', reasoning: 'Deep clean price is in the knowledge base' } }]
});

const canAnswer = ifElse({
  version: 2.2,
  config: {
    name: 'Answer Found In Knowledge?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.output.can_answer }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1040, 200]
  }
});

const createReplyDraft = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Create Reply Draft In Thread',
    parameters: {
      resource: 'draft',
      operation: 'create',
      subject: expr('Re: {{ $("Normalize Email").item.json.subject }}'),
      emailType: 'text',
      message: expr('{{ $json.output.reply }}'),
      options: { threadId: nodeJson(normalizeEmail, 'threadId'), sendTo: nodeJson(normalizeEmail, 'sender') }
    },
    credentials: gmailCred,
    position: [1300, 100]
  },
  output: [{ id: 'r-123', message: { id: '19a1b2c4', threadId: '19a1b2c3' } }]
});

const markDrafted = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Label Drafted + Triaged',
    parameters: {
      resource: 'message',
      operation: 'addLabels',
      messageId: nodeJson(normalizeEmail, 'messageId'),
      labelIds: [placeholder('Label ID for "ai-triaged"'), placeholder('Label ID for "ai-draft-ready"')]
    },
    credentials: gmailCred,
    position: [1540, 100]
  },
  output: [{ id: '19a1b2c3' }]
});

const flagForHuman = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Flag For Human (Unknown Answer)',
    parameters: {
      resource: 'message',
      operation: 'addLabels',
      messageId: nodeJson(normalizeEmail, 'messageId'),
      labelIds: [placeholder('Label ID for "ai-triaged"'), placeholder('Label ID for "needs-human"')]
    },
    credentials: gmailCred,
    position: [1300, 320]
  },
  output: [{ id: '19a1b2c3' }]
});

const labelNotSupport = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Route Out Non-Support',
    parameters: {
      resource: 'message',
      operation: 'addLabels',
      messageId: expr('{{ $json.messageId }}'),
      labelIds: [placeholder('Label ID for "ai-triaged"'), placeholder('Label ID for "not-support"')]
    },
    credentials: gmailCred,
    position: [760, 420]
  },
  output: [{ id: '19a1b2c3' }]
});

const labelUnclear = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Flag Unclear For Human',
    parameters: {
      resource: 'message',
      operation: 'addLabels',
      messageId: expr('{{ $json.messageId }}'),
      labelIds: [placeholder('Label ID for "ai-triaged"'), placeholder('Label ID for "needs-human"')]
    },
    credentials: gmailCred,
    position: [760, 640]
  },
  output: [{ id: '19a1b2c3' }]
});

const chatOpened = trigger({
  type: '@n8n/n8n-nodes-langchain.chatTrigger',
  version: 1.5,
  config: {
    name: 'Website Chat Message',
    parameters: { public: false, options: { responseMode: 'streaming' } },
    position: [0, 900]
  },
  output: [{ sessionId: 'demo-session', chatInput: 'Do you clean on Sundays?' }]
});

const chatModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.6,
  config: { name: 'Claude Haiku (Chat)', parameters: { model: haiku, options: { temperature: 0.2, maxTokensToSample: 600 } }, credentials: claudeCred, position: [300, 1100] }
});

const chatAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Chat Support Agent',
    parameters: {
      promptType: 'auto',
      options: {
        systemMessage: 'You are the website chat assistant for Brightside Home Cleaning. Reply immediately and briefly.\n\n' + KB + '\n' +
          'Answer ONLY from the knowledge base. If the answer is not there, say you will pass the question to the team and ask for the visitor\'s email. Never invent prices, policies or availability.'
      }
    },
    subnodes: { model: chatModel },
    position: [300, 900]
  },
  output: [{ output: 'We are closed on Sundays. We clean Monday to Saturday, 8am to 6pm.' }]
});

const overview = sticky('## AI Support Desk (DEMO)\nGmail + website chat share one knowledge base.\n\n1. Poll unread inbox mail every 5 min (skips anything labelled ai-triaged).\n2. Claude Haiku classifies support vs not-support; unclear goes to a human.\n3. Support mail is answered ONLY from the knowledge base. If it is not covered, the email is flagged needs-human instead of guessing.\n4. Replies are saved as Gmail DRAFTS in the same thread for human review (swap the draft node for Gmail reply to auto-send).\n5. Every handled email gets the ai-triaged label so it is processed exactly once.\n\nFictional demo business. Not client work.', [newEmail, normalizeEmail, classifyEmail], { color: 4 });

const setupNote = sticky('## Setup\n- Create Gmail labels: ai-triaged, ai-draft-ready, needs-human, not-support, then put their IDs in the four label nodes.\n- Edit the knowledge base text in the two AI prompts.\n- Chat: open the chat panel to test, or make the Chat Trigger public to embed the widget.', [chatOpened, chatAgent], { color: 6 });

export default workflow('ai-support-desk-demo', 'DEMO - AI Support Desk (Gmail + Chat, one knowledge base)')
  .add(newEmail)
  .to(normalizeEmail)
  .to(classifyEmail)
  .add(classifyEmail.output(0).to(draftAnswer.to(canAnswer.onTrue(createReplyDraft.to(markDrafted)).onFalse(flagForHuman))))
  .add(classifyEmail.output(1).to(labelNotSupport))
  .add(classifyEmail.output(2).to(labelUnclear))
  .add(chatOpened)
  .to(chatAgent)
  .add(overview)
  .add(setupNote);
