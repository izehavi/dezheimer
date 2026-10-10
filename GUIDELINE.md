# Dezheimer — Project Guideline

This document is the reference for the project: what we are building, the rules we follow, and the order in which we build it. The current progress is tracked separately in [CHECKPOINT.md](CHECKPOINT.md).

## 1. Vision

People with Alzheimer's disease lose the ability to rely on their own memory for appointments, for recent events, and for what is happening in the lives of the people they love. Dezheimer is an **external memory**: it records what happens, keeps what matters, and gives it back in a simple form.

It serves three needs:

- **Agenda management** — know what is planned and be reminded of it.
- **Social interaction** — keep an up-to-date memo for each family member and friend, so the person can check it before a meeting and follow what is happening in their lives.
- **Personal diary** — a record of what happened each day.

## 2. Users

| User | Role |
| --- | --- |
| **The person with Alzheimer's** | Main user. Reads the agenda, the memos and the diary. Must be able to use the app alone. |
| **The caregiver** (family member or professional) | Sets up the app, adds people and photos, checks and corrects what the models produce. |
| **Family and friends** | Appear in the memos. Their conversations may be recorded, so their consent matters. |

## 3. Design principles

These apply to every step of the project.

1. **Simple above all.** Large text, few choices per screen, no hidden menus, the same layout every day. Faces and photos before names and text.
2. **A wrong memory is worse than no memory.** The models can make mistakes or invent facts. Every piece of generated information must be traceable to the transcript it came from, and the caregiver must be able to review and correct it.
3. **Privacy by default.** The data is health-related and very personal. Process on the device whenever possible, store the minimum, and never record someone without their consent.
4. **Reassuring, never testing.** The app gives information; it never quizzes the person or points out that they forgot something.
5. **Small models.** Models should be small enough to run locally or cheaply. This is a constraint for cost and for privacy.
6. **Voice first.** Everything important can be done by speaking: the first thing on the first screen is one large button to talk to the app. The app answers aloud. Typing and menus are never required.
7. **Meaning, not wording.** A request works whatever the words used. "Add to my agenda", "I plan to go" and "I'm seeing Paul on Friday" all create an event.

## 4. Data model

The three features share the same core objects. Defining them early keeps the prototype and the models aligned.

- **Person** — name, photo, relationship to the user, key facts, list of memo entries.
- **Memo entry** — a dated piece of news about a person ("Sarah started a new job in Lyon").
- **Event** — title, date and time, place, people involved, reminder settings.
- **Diary entry** — date, short text of the day, people seen, linked events.
- **Transcript** — date, speakers, text. The source for everything the models generate.

## 5. What the voice can do

The user taps the button and says one thing. For anything that would be written down, the app reads it back and waits for "yes".

| Request | Example |
| --- | --- |
| Add an event | "I plan to go to the market tomorrow at 10." |
| Change an event | "Move the lunch with Sarah to 1 pm." |
| Cancel an event | "Cancel my appointment with the doctor." |
| Add a person | "Add a new person, her name is Julie, she is my niece. I met her at the choir." |
| Add a connection | "Julie is Sarah's daughter." |
| Add a memo | "Remember that Emma won her competition." |
| Ask for the plan of a day | "What do I have today?", "When do I see Sarah?" |
| Ask about a person | "Who is Rose?", "How do I know Paul?", "Any news from Leo?" |
| Ask about a past day | "What did I do yesterday?" |
| Search | "Search for the radiator.", "Where are my keys?" |
| Ask the day or the time | "What day is it?" |

Planned next: correct or remove a memo, add a fact about a person ("Rose is allergic to nuts" kept as a permanent fact), ask who someone in a photo is, call a person, and "repeat" or "say it more slowly".

When a name is not heard exactly but is close to someone the user knows, the app asks: "Do you mean Rose?" It does not ask when the user is adding a new person, since a new name is expected then.

The app also speaks first: it reminds the user of each event 30 minutes before, 5 minutes before, and when it starts.

## 6. Roadmap

Each phase ends with something that works and can be shown. We do not start a phase before the previous deliverable exists.

### Phase 0 — Project definition

Write down the vision, the plan and the open decisions.

**Deliverable:** this guideline, the README, the first checkpoint.

### Phase 1 — Web prototype

Build a website that shows the product with example data, without any model. Its purpose is to visualize the product, test the interface, and fix the data model.

- Home screen: today's date, what is planned today, who is coming.
- Agenda: day and week views, event details.
- People: a gallery of faces, and a memo page per person.
- Diary: one entry per day, browsable by date.
- Example data for a fictional user, their family and a few weeks of life.

**Deliverable:** a website running locally where all three features can be browsed with example data.

### Phase 2 — Transcription model

Add a small speech-to-text model that writes down discussions.

- Choose a small model that works well in the target language and with elderly voices.
- Take an audio recording as input, produce a dated transcript.
- Separate the speakers (who said what), at least user versus other.
- Measure quality on a small set of realistic test recordings.

**Deliverable:** a script that turns an audio file into a transcript, with a measured error rate on our test recordings.

### Phase 3 — Summarization model

Add a second model that reads a transcript and extracts what matters.

- From one transcript, produce: a diary entry, memo updates for the people mentioned, and agenda events to create or change.
- Output in a fixed structured format that matches the data model in section 4.
- Link each extracted fact to the sentence of the transcript it comes from.
- Handle updates and not only creations: a moved appointment, news that replaces older news.
- Build a small evaluation set of transcripts with the expected output, to measure missed and invented facts.

**Deliverable:** a script that turns a transcript into proposed updates, with measured accuracy on our evaluation set.

### Phase 4 — Integration

Connect everything into one working pipeline.

- A backend and a database that store the objects of section 4.
- The pipeline audio → transcript → proposed updates → app.
- A review screen where the caregiver accepts, edits or rejects the proposed updates.
- Replace the example data of the prototype with real stored data.

**Deliverable:** record a conversation, and see the agenda, a memo and the diary updated in the app after review.

### Phase 5 — Reminders, caregiver access and user testing

Make the product usable in real life.

- Reminders for events, including a reminder to read someone's memo before meeting them.
- Separate access for the caregiver.
- Consent and recording controls: clear indication when recording, easy pause, deletion of data.
- Tests with caregivers and, when possible, with people with early-stage Alzheimer's.

**Deliverable:** a version tested by real users, with their feedback written down.

### Later

- **Leave on time.** The app knows where the user is and where the event takes place, works out the travel time, and says when to leave: "You should leave in 15 minutes to be at Carmel coffee at 3." Then again 5 minutes before leaving. It needs the position of the phone, an address for each place, and a travel-time estimate. The address is there since 2026-10-08: the place of a new event is looked for on the map around the user. The travel time and the reminder are still to build.
- **Help when lost.** People with Alzheimer's sometimes no longer know where they are, why they are there, or where they were going. When the user asks ("Where am I?", "What am I doing here?", "Where was I going?"), the app answers from the position of the phone and the agenda: "You are on Garden Street, near the bakery. You were going to Dr. Martin's office for your appointment at 10:30. It is a 5-minute walk." It can then guide the user there or back home, and offer to call a relative. It only does this when asked, and it stays calm and short.
- **The simple things of the day.** A first version exists since 2026-10-10 ("My day"): what to do every day, what to take before leaving home, what is good to know, and a task with steps as described below. Still to build: warning about a step done twice, and listening without touching the screen.
- **Help during a task.** The user starts a task that has steps, such as cooking a recipe, and the app keeps track of it for as long as the task lasts. The user says what is done ("I have put the salt", "The meat is in"), and can ask at any time "Where am I?", "Did I put the salt?" or "What is next?". The app answers from what was said, reads the next step, and can warn about a step that was skipped or done twice. Nothing is kept once the task is finished. The same idea works for getting dressed, taking medicine, or packing a bag.
- Mobile app, with reminders that work when the app is closed.
- Continuous recording with a wearable microphone.
- Face recognition to recall a person's memo.

## 7. A phone, and local by default

The app is meant to run on a phone, and to keep the data on the device as much as possible. The current prototype runs its models on a computer. This section is the plan to get from one to the other.

| Part | Today | On a phone |
| --- | --- | --- |
| Transcription | Whisper small, 244 million parameters, with the user's names and places | Too heavy to be comfortable on a phone. Whisper base (74 million) or tiny (39 million) run on a phone; the vocabulary helps at every size, and fine-tuning on the user's voice is the way to make a small one good enough. |
| Understanding a voice request | A sentence model of 22 million parameters, plus rules | Runs on a phone as it is. This is why requests go through it and not through a language model. |
| Speaking | The voices installed on the device | Same. |
| Finding a place on the map | In the app itself, with the position given by the device | Same code. A phone gives a much better position than a computer. |
| Automatic memos from a free conversation | A language model of 3 billion parameters, on a graphics card | Too large for a phone. See below. |

### How the app gets onto a phone

Today the screens run in a browser and the models run in a Python server on a computer. A phone cannot run that server. The proposed path, in three steps, each one usable:

1. **The phone as a screen.** Built on 2026-10-08 for an iPhone (`start-phone.bat`), not yet tried on the iPhone itself. The phone opens the app served by the computer over the home Wi-Fi. Nothing is rewritten. It needs a secure address (HTTPS), because phone browsers only give the microphone and the position to secure pages; the computer makes its own certificate, which the phone is told to trust once. This is for testing the screens and the voice on a real phone; it only works at home.
2. **The models in the app (weeks).** The screens stay as they are: they are plain web pages, already laid out for a narrow screen. What the server does moves into the app: the speech model and the sentence model run on the device in the ONNX format, and the rules that read a request, now in Python, are rewritten in JavaScript and checked against the same test sentences. The app then works with no computer and no network, except the map search and the backup.
3. **A real phone app (after that).** The same pages are wrapped in a native shell for Android and iPhone. This is what gives reminders when the app is closed, the position in the background for "leave on time", and a place in the app stores. It needs Node.js on the development computer, and Android Studio for Android. For an iPhone it needs a Mac with Xcode and an Apple developer account: an iPhone app cannot be built on Windows.

From now on, anything new that does not need a model is written in the app, not in the server, so that it moves to the phone without change. The map search is the first example.

### Automatic memos on a phone

For automatic memos, the plan is to stop asking one large model to do everything, and to use the cheapest tool that works at each step:

1. **Say it, when it matters.** "Remember that..." is exact, instant and already runs anywhere. It stays the main way to keep something.
2. **Pick the sentences worth keeping.** The small sentence model that understands requests can also score each sentence of a conversation: news about a person, a fact, an appointment, or small talk. Only the few sentences that matter go further. This is cheap and catches more than a model that reads the whole text at once.
3. **Write each memo from one sentence.** Turning one chosen sentence into a memo is a much easier task than reading a whole conversation. A language model ten times smaller, trained for this single task on examples written by a large model, should be enough, and fits on a phone.
4. **Check by code**, as today: the words must have been said, the person must be named.
5. **If a phone is still too weak**, the heavy step can run on a computer at home that the phone reaches over the home network. The data still never leaves the home.

## 8. Accounts, and an app for relatives

The user signs in with an email and a password. The account has two purposes, decided by the project owner:

- **Backup:** get the data back if the phone is lost.
- **Another device:** find the same data on a second device.

A first version exists: what the user adds is saved in the account after each change, and loaded when signing in on another device. Signing in with Google can be added later; it needs a Google developer project created by the project owner.

This pulls against "local by default", because the backup has to be stored somewhere outside the phone. The rule is: everything is processed on the device, and only the backup leaves it. Before real use, the backup must be encrypted so that the server cannot read it.

**Later: an app for relatives.** The same account system lets a family member or friend have their own app, linked to the user with the user's agreement:

- They get a notification when the user is reminded of a meeting with them: "Helen has just been reminded of your lunch at 12:30."
- They can check that a meeting they have together is in the user's agenda, and add or correct it.
- They can add news about themselves to their own memo.
- They can be told if the user asks for help or seems lost.

Each relative sees only what concerns them, unless the user or the caregiver gives them more.

## 9. Risks to keep in mind

| Risk | Response |
| --- | --- |
| The model invents or distorts a fact | Source link for each fact, caregiver review, evaluation set in Phase 3. |
| Recording people without consent | Explicit consent flow, visible recording indicator, legal check before any real-world test. |
| Sensitive health data (GDPR) | Local processing where possible, minimal storage, deletion on request. |
| Interface too complex for the user | Test the prototype early with caregivers; apply principle 1 strictly. |
| Poor transcription of elderly or quiet voices | Test on realistic recordings in Phase 2 before building on top of it. |

## 10. How we work

- [CHECKPOINT.md](CHECKPOINT.md) is updated at the end of each work session or milestone: what was done, what is next, what is undecided.
- This guideline changes only when the plan itself changes.
- Technical decisions (framework, model choice, storage) are recorded in the checkpoint when they are made, with the reason.
