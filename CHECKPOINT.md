# Dezheimer — Checkpoint

Where the project stands. Updated at the end of each work session or milestone. The plan itself is in [GUIDELINE.md](GUIDELINE.md).

**Last update:** 2026-10-08

## Current state

**The app can now be used by voice, and has accounts with a backup.** The home screen starts with one large button: the user says one thing, and the app adds, moves or cancels an event, adds a person, a connection or a memo, or answers a question aloud. It also reminds the user of events aloud. This works on example data, in a browser on a computer.

What is solid and what is not:

| Part | State |
| --- | --- |
| Live transcription (Whisper small, with the user's vocabulary) | Whisper tiny worked but misheard many words in practice. Changed on 2026-10-08; not yet confirmed with a real voice. |
| Voice assistant | Works when the sentences are typed. **Not tested with a real voice yet.** |
| Spoken reminders | Work in a test, while the app is open. |
| Connections map | Works, with selection and search. |
| Automatic memos from a whole conversation (language model) | Weak: finds about half of the news, slow, and too large for a phone. |
| Accounts and backup | First version works with email and password. Reachable from this computer only until the server is put online. The backup is not encrypted yet. |
| Place of an event on the map | New on 2026-10-08. Works in a test with a simulated position in Paris. Not tried with a real device position yet. |
| iPhone | First prototype built on 2026-10-08: the iPhone opens the app from the computer over the home Wi-Fi. Checked from the computer only. **Not tried on the iPhone yet.** |

| Phase | Status |
| --- | --- |
| 0 — Project definition | Done |
| 1 — Web prototype | Working; not reviewed with a caregiver yet |
| 2 — Transcription model | Working with a real voice; quality not measured |
| 3 — Understanding what is said | Voice requests working by meaning; automatic memos in a first, weak version |
| 4 — Integration | Started: accounts and a backup of what the user adds, in a database. The app still works from the browser's own copy |
| 5 — Reminders, caregiver access, user testing | Spoken reminders in a first version; the rest not started |

## Improvement mode: where we are now

The project is in a practice phase. The project owner uses the assistant by voice; after each request the app asks "Did I do what you wanted?" with two buttons: **Yes, it did what I wanted**, and **No**, which opens a box to explain what was wanted.

- Every exchange is saved as one line in `feedback/feedback.jsonl`: what was heard, what the app answered, what the server understood at each step (intent, score, details), the verdict (`yes`, `no`, or `unanswered`), and the comment.
- The folder is not committed to git, because it holds what the tester said.
- **To improve the app:** read that file, group the `no` and `unanswered` lines by cause (misheard words, wrong intent, wrong detail, wrong answer), then fix each cause with an example sentence in [server/intents.py](server/intents.py), a rule in [server/assistant.py](server/assistant.py) or [server/commands.py](server/commands.py), and a test. The `yes` lines become tests too, so that what works keeps working.
- The mode is on by default. It can be switched off under "What can I say?" on the home screen.

### Round 1 — 2026-10-08

17 requests by voice: 4 yes, 9 no, 4 unanswered. Every "no" and every useful "yes" is now a test in [tests/test_feedback.py](tests/test_feedback.py).

| Cause | Examples from the feedback | What was done |
| --- | --- | --- |
| Words misheard by the speech model (the main cause) | "Mimo" for memo, "Edynore" for Elinor, "comer coffee" for Carmel coffee, "you" for yes | The app now sends the user's names and places to the speech model with each phrase, and the model is one size up (small instead of tiny). To be confirmed with the tester's voice. |
| A new name heard wrong, with no easy way to fix it | "Ilana" for Ilan | Before saying yes, the name can be corrected by hand in the confirmation. The same for the title and place of an event, and the text of a memo. |
| "Information about someone" treated as a search | "Information about Nadia" read out unrelated diary pages | It is now a question about the person. A search only uses the meaningful words, and reads only the sentences that match. |
| A memo treated as an event because a day was said | "Memo about Elinor. She starts her work on Friday." | "Memo about ..." and "add an information about ..." are memos. |
| No way to say who a known person is | "Elinor. She is my sister." | New: the relationship of a known person can be set by voice. |
| A fact about a person not understood | "Lothan, she's working in chemistry" | A statement about a known person that is not a link between two people becomes a memo. |
| Asking for the link with someone | "To know the link of David and me" | Understood as "how do I know David". |
| Only the day and time of an event could change | "Change the place of the meeting" | The place can be changed; the app asks "What is the new place?" if it was not said. |
| Wrong name picked for a new person | "Ad, a new person, Lothan" gave "Ad" | The name is taken after "a new person". |
| "I want to go ..." not seen as a new event | "I want to go alone to the park at 2 pm" | Added to the examples. |
| Small wording problems | "your sister Lothan", "At The comer coffee", "At what time?" asked twice | Fixed. |

Not fixed: a short "yes" heard as "you". The app does not accept "you" as a yes, because background noise is also written "you" and nothing must be added without consent. The Yes button remains, and the larger model should hear "yes" better.

## How to run it

On an iPhone: double-click `start-phone.bat` and follow the README, section "Use it on an iPhone".

Double-click [start.bat](start.bat). The app opens at http://localhost:8765. The server restarts by itself when its code changes.

## What exists

### Screens — [web/](web/)

| Screen | What it does |
| --- | --- |
| Today | The big "Talk to me" button and the conversation with the assistant; then the next event, the events of the day, and yesterday's diary entry. |
| Agenda | A week of days to pick from, and the events of the chosen day. |
| People | A gallery of faces; one page per person with how the user knows them, key facts, latest news, next and last time together. |
| People, connections | A map with the user in the middle. People are grouped as family, friends, and care. Touching a person highlights their links and shows how the user knows them. A search box finds people from any word about them. |
| Diary | One page per day: the text of the day, the people seen, the notes, what was planned. |
| Account and backup | Create an account or sign in; shows when the data was last saved. Reached from the bottom of the Today screen. |
| Listen | Records a whole conversation as text (spoken or typed). Agenda commands and what the language model finds to remember appear as proposals. |

| File | Role |
| --- | --- |
| [web/js/assistant.js](web/js/assistant.js) | The assistant: listens to one request, asks the server what it means, carries it out on the data, answers aloud, asks for confirmation before writing. |
| [web/js/places.js](web/js/places.js) | Looks for the place of an event on the map around the user: the position of the device, or the town the user gave; the search; the distance. |
| [web/js/mic.js](web/js/mic.js) | The microphone, shared by the assistant and the Listen screen: capture, cutting into phrases, transcription requests. |
| [web/js/speech.js](web/js/speech.js) | The voice of the app, using the voices installed on the device. |
| [web/js/reminders.js](web/js/reminders.js) | Spoken reminders 30 minutes before, 5 minutes before, and at the start of each event. |
| [web/js/graph.js](web/js/graph.js) | The connections map. |
| [web/js/account.js](web/js/account.js) | Sign-in, and the backup: saves after each change, loads what another device saved. |
| [web/js/views.js](web/js/views.js) | The Today, Agenda, People and Diary screens. |
| [web/js/listen.js](web/js/listen.js), [commands.js](web/js/commands.js), [memory.js](web/js/memory.js) | The Listen screen, its agenda proposals, and its "Find what to remember" proposals. |
| [web/js/data.js](web/js/data.js) | Example data for a fictional user, Helen, and the storage of what is added. |
| [web/js/app.js](web/js/app.js), [dates.js](web/js/dates.js), [recorder-worklet.js](web/js/recorder-worklet.js) | Navigation, date helpers, raw microphone samples. |

### Server — [server/](server/)

| File | Role |
| --- | --- |
| [server/phone.py](server/phone.py) | `start-phone.bat`: the same app for the computer (port 8765) and for a phone on the same Wi-Fi (secure, port 8443). Makes the certificate, serves a plain page (port 8767) that explains how to trust it, and asks each phone for a 6-digit code once. The certificate and the code are kept in `%USERPROFILE%\.dezheimer\phone`. |
| [server/app.py](server/app.py) | FastAPI server: serves the app and the four services below. |
| [server/transcriber.py](server/transcriber.py) | `POST /api/transcribe`: audio to text with `openai/whisper-small.en`. The app sends the user's names and places with each phrase, and the model then prefers those spellings. The size is set by the `DEZHEIMER_ASR_MODEL` variable. |
| [server/intents.py](server/intents.py) | Finds what a sentence asks for, by meaning, with `sentence-transformers/all-MiniLM-L6-v2` and its list of example sentences. |
| [server/assistant.py](server/assistant.py) | `POST /api/assist`: the intent, then the details read by rules (names, relationship, how they met, the memo text, the day asked about...). |
| [server/accounts.py](server/accounts.py) | `/api/account/...`: accounts and backups in a SQLite file. Passwords are stored as salted scrypt hashes, sign-in tokens as hashes. |
| [server/commands.py](server/commands.py) | Reads an event from a sentence: day, time, people, place, activity. Also `POST /api/command`, used by the Listen screen. |
| [server/understanding.py](server/understanding.py) | `POST /api/understand`: summary and memos from a whole conversation with `Qwen/Qwen2.5-3B-Instruct`, checked by code. |

Tests are in [tests/](tests/): 61 tests, run with `python -m unittest discover tests`.

### How a voice request works

1. The user taps the button. The microphone records one phrase and switches itself off.
2. Whisper writes the phrase down, helped by the user's names and places.
3. The sentence model compares the phrase, with the names replaced by a neutral one, to about 140 example sentences, and picks the closest intent. Two rules help it: a question can only ask for information, and a few opening words are strong hints ("Remember that...", "Search for...").
4. Rules read the details. If one is missing, the app asks for it and listens again. An event needs a day, a time, a place and who it is with: the app asks "On which day?", "At what time?", "Where is it?", "With whom?" until it has them. "Alone" and "nowhere" are accepted answers.
5. A name that is close to a known person without being exactly theirs is handled before the details are read. Very close ("Sara" for Sarah): it is corrected. Fairly close ("Ross" for Rose): the app asks "Do you mean Rose?". This is skipped when adding a new person.
6. For a question, the app answers aloud from the data. For something to write down, change or cancel, it reads it back and waits for "yes" or "no", said or tapped.

7. For a new event, or a new place for an event, the app looks for the place on the map around the user before reading it back: "On the map, I found Café de la Mairie, Place Saint-Sulpice, Paris, 1.3 kilometres from here." Up to three places are shown and the user taps the right one, or "None of these". The event keeps the name, the address and the position, and the agenda has a "Show on the map" link. Places such as "at home" are not searched.

Where the user is: the app asks the device for its position (the browser asks for permission once). If the device does not give it, the app asks "In which town are you?" once and remembers the town. Answering "no" keeps the place as it was said.

To change or cancel an event, the app looks for the coming event that best fits what was said: who it is with, the day, and the words of its title.

To make a request more robust, add example sentences to `EXAMPLES` in [server/intents.py](server/intents.py).

### Environment

- Python 3.12, virtual environment in `%USERPROFILE%\.venvs\dezheimer` (outside the project, so that OneDrive does not sync it).
- PyTorch `2.11.0+cu128` on the NVIDIA RTX 4070. This is the newest build that works with the installed NVIDIA driver (566.36).
- The server uses port 8765 (port 8000 is used by another project on the development machine).
- What the user adds is saved in the browser, and in the account backup when signed in. The accounts database is `%USERPROFILE%\.dezheimer\accounts.db`, outside the project.
- The project is saved on GitHub: github.com/izehavi/dezheimer, branch `main`.

## What was tested

- **Speech model, 2026-10-08:** ten sentences read by two synthetic voices, three model sizes, with and without the vocabulary. With the vocabulary, every size wrote "Elinor", "Lothan" and "Carmel Coffee" correctly where it had written "Eleanor", "Lathan" or "caramel coffee" without it. On the clear voice all three sizes were otherwise right. On a French synthetic voice reading English, all three made many mistakes and "small" was only slightly better; this voice is a much harder case than a real speaker, so it does not settle the choice of size. A real comparison needs recordings of the tester.
- **iPhone prototype, 2026-10-08,** from the computer only: the secure address is accepted with the computer's certificate and refused without it; without the code, the pages show the code screen and the services answer "not allowed"; a wrong code is refused and the right one opens the app; the app on the computer needs no code. At the size of an iPhone 13, every screen fits the width and a typed request was answered. Not tested, because it needs the iPhone: installing and trusting the certificate, the microphone, the sound of the voice, the position, "Add to Home Screen".
- **Place on the map, 2026-10-08,** typed, with a simulated position in Paris: a café with three places of the same name gave the nearest first and kept the one tapped, with its address; an invented place and "at home" were kept as said; a new place for an event was found; with the position refused, the app asked for the town, found the place around it, and remembered the town; answering "no" added the event without a map. Not tested: the real position of a real device, and a place name heard by voice.
- **Feedback round 1, replayed typed:** the requests that had failed now give what the tester wanted (see the table above).
- **Intent finding:** 55 of 55 sentences that are not among the examples. The examples and rules were adjusted on these same sentences, so this is not an independent score; an earlier version got 49 of 55 on them.
- **Details read by rules:** 31 unit tests pass.
- **Assistant, end to end with typed sentences** in a headless browser: 26 requests in a row gave the expected answers. This covered the plan of a day, the next time with a person, who someone is, the diary, search, an event with a missing time completed on the next sentence, refusing with "no", a new person with a relationship and where they met, a memo about that new person, a connection, and a note about a thing.
- **Reminder:** an event 4 minutes ahead was announced on screen and passed to the voice.
- **Change and cancel, typed:** moving an event to a new time, postponing one to another day, cancelling one, and asking to cancel something that does not exist all gave the expected result.
- **Names, typed:** "Who is Ross?" asked "Do you mean Rose?" and answered about Rose after "yes"; "When do I see Pauline?" then "no" answered that Pauline is not known; "Davide" was corrected to David without asking; adding a new person called Rosa asked nothing.
- **Required details of an event, typed:** "I have an appointment tomorrow" was completed by answering "3 pm", "Carmel coffee" and "Sarah" to the three questions; "alone" was accepted for an event without anyone.
- **Improvement mode:** a "yes", a "no" with a comment, and an unanswered request were each saved with the full exchange.
- **Account:** created an account, wiped the browser, signed in again: the same data came back. A wrong password was refused. A later change was saved by itself.
- **Not tested:** the assistant with a real voice and real sound from the speakers; the voice itself, since the test replaced it; any phone; anyone other than the developer.
- **Language model reader** (earlier today): on three typed conversations it found 4 of about 9 pieces of news, with no invented quote, and takes 15 to 40 seconds.

## Known limits

- English only.
- The assistant understands one request per phrase.
- Changing or cancelling picks the single best-fitting event and reads it back; it does not yet ask "which one?" when two fit equally.
- Name checking compares spelling and a rough idea of sound. It has only been tried on a handful of names.
- The backup is one document: if two devices change things at the same moment, the one that saves second takes the other's copy and loses its own last change.
- The server only listens on this computer, so the backup cannot be reached from a phone yet. No password reset, no email check, no limit on sign-in attempts.
- A time said without "am" or "pm" is guessed: 1 to 7 is taken as the afternoon.
- A new person's name must be capitalized in the transcript, which Whisper does, or follow "named", "called" or "name is".
- The map search needs the internet. It sends the name of the place and a position rounded to about one kilometre to an open map service (photon.komoot.io, built on OpenStreetMap), which is a free service with no guarantee. A place is only found if its name is written much as the map has it: a name misheard by the speech model is not found, and the place is then kept as said.
- A computer often gives a poor position, or none. A phone gives a good one.
- The choice between several places is made by tapping, not yet by voice.
- The iPhone prototype needs the computer switched on, on the same Wi-Fi. It does not work outside the home. Reminders do not come when the iPhone is locked or the app is closed.
- If the address of the computer on the Wi-Fi changes, the address to open on the iPhone changes too (the window of the computer shows it). The certificate on the iPhone stays good.
- Reminders only work while the app is open in the browser, and the browser may keep the voice silent until the user has touched the page once.
- The connections map draws everyone on one circle: it gets crowded above about 12 people.
- Automatic memos: see the table above. The summary of a conversation is not checked by code.
- No photos, no caregiver screen.

## Open decisions

| Decision | Needed for | Proposal |
| --- | --- | --- |
| Where the server for the backup is hosted | Backup from a phone | To decide. Until then it runs on the development computer. |
| Encrypting the backup so the server cannot read it | Real use | To do before any real data is stored. |
| Sign in with Google | Accounts | Later. Needs a Google developer project created by the project owner. |
| How the phone app is built | Phone | Proposal in the guideline, section 7: keep the web pages, move the two small models and the rules into the app, then wrap it in a native shell. To confirm by the project owner. Step 1 (the phone as a screen over the home Wi-Fi) can be done first. |
| Which map service | Real use | The open service used now is fine for a prototype. For real use: a paid service with a guarantee, or our own copy of the map data. |
| Automatic memos without a large model | Phase 3 | The steps in the guideline, section 7: pick the sentences worth keeping with the small sentence model, then write each memo with a much smaller model trained for that one task. |
| Speaker separation (who said what) | Phase 3 | To decide. It matters for sentences like "I started a new job". |

## Next steps

1. **Second round of practice**, to see whether words are heard better and what still fails.
2. **Decide on fine-tuning the speech model.** The plan: first measure. Keep, with the tester's agreement, the audio of each phrase next to what was really said; about 100 phrases are enough to compare model sizes fairly, and one to two hours are needed to fine-tune. Fine-tuning is most useful to make a phone-sized model (tiny or base) as good on this voice as the larger one.
3. **Try the prototype on the iPhone** (`start-phone.bat`) and report what does not work: the microphone, the voice and the position can behave differently on an iPhone.
4. Add the missing voice requests: correct or remove a memo, a permanent fact about a person; choose a place on the map by voice.
5. Build the "pick the sentences worth keeping" step and compare it with the language model on a set of about 20 conversations.
6. Encrypt the backup, and decide where the server is hosted.
7. Show the prototype to a caregiver.
8. Ideas written in the guideline for later: help when lost, help during a task such as cooking, "leave on time", and an app for relatives.

## Decisions made

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-07 | Build the web prototype with example data before any model. | To visualize the product and fix the data model early. |
| 2026-10-07 | Prototype in plain HTML, CSS and JavaScript, with no build step. | Node.js is not installed on the development machine. |
| 2026-10-07 | Design for a tablet first. | Large screen, touch, easy to leave on a table. This changes: the target is now a phone. |
| 2026-10-07 | The app and the conversations are in English for now. | Decided by the project owner. |
| 2026-10-07 | Transcription with `openai/whisper-tiny.en`, run by a local Python server. | A tiny pretrained model from Hugging Face was requested. Replaced on 2026-10-08. |
| 2026-10-08 | Transcription with `openai/whisper-small.en` on the development computer, and the user's names and places given to the model. | In the first round of practice, misheard words were the main cause of failure. The vocabulary costs nothing and works at every size. The size is a provisional choice until it is measured on the tester's voice. |
| 2026-10-08 | "You" is not accepted as "yes". | The speech model also writes "you" for background noise; nothing must be added without consent. |
| 2026-10-08 | The place of an event is looked for on a map, in the app and not in the server, with a rounded position. | Asked by the project owner. In the app, it will work the same on a phone. The rounded position is enough to search around and says less about the user. |
| 2026-10-08 | The first iPhone prototype is the web app opened from the computer over the home Wi-Fi, with its own certificate and a code. | An iPhone app cannot be built on Windows, and this needs no rewriting. Nothing goes through the internet, unlike a tunnel service. The code is needed because anyone on the same Wi-Fi can reach the address. |
| 2026-10-08 | The project is saved on GitHub (github.com/izehavi/dezheimer) each time something works. | Asked by the project owner. |
| 2026-10-08 | New work that needs no model is written in the app, not in the server. | The app must end up on a phone, which cannot run the Python server. |
| 2026-10-07 | Everything the app is about to write down must be confirmed first. | A wrong memory is worse than no memory (guideline, principle 2). |
| 2026-10-07 | Voice requests are understood with a small sentence model and rules, not with a language model. | It is fast (about 50 ms), small enough for a phone, and predictable. The project owner asked for requests to work by meaning, on a phone, locally. |
| 2026-10-07 | Voice first: the main button of the home screen is the microphone. | Asked by the project owner, for ease of use by an older person. |
| 2026-10-07 | Summary and memos from a whole conversation with `Qwen/Qwen2.5-3B-Instruct`, checked by code. | First working version. To be replaced by a lighter method. |
| 2026-10-07 | The target device is a phone, and data stays local as much as possible. | Decided by the project owner. |
| 2026-10-07 | Accounts are for backup and for using the app on another device; later, for an app for relatives. Email and password first. | Decided by the project owner. Everything is still processed on the device; only the backup leaves it. |
| 2026-10-07 | An event must have a day, a time, a place and a person; the app asks for what is missing. | Asked by the project owner. "Alone" and "nowhere" are accepted, so that an event without a place or a person can still be added. |
| 2026-10-07 | Improve the assistant from recorded practice, not from guesses. | Asked by the project owner: each request gets a yes or no verdict and a comment. |
| 2026-10-07 | A misheard name is asked about ("Do you mean Rose?"), except when adding a new person. | Asked by the project owner: a new person is expected to be unknown. |

## Log

- **2026-10-07** — Project created: README, guideline, checkpoint.
- **2026-10-07** — Web prototype: Today, Agenda, People and Diary screens with example data.
- **2026-10-07** — Live transcription with Whisper tiny and a Listen screen; GPU build of PyTorch.
- **2026-10-07** — Agenda commands by keywords.
- **2026-10-07** — Language model reader for summaries and memos; first connections map.
- **2026-10-07** — Voice assistant on the home screen, understanding requests by meaning; new people, connections and memos by voice; spoken answers and reminders; redesigned connections map with search. Guideline updated with the voice functions, the phone and local plan, accounts, and the "leave on time" idea.
- **2026-10-07** — Change and cancel an event by voice; "Do you mean ...?" for misheard names; accounts with email and password and a backup. Guideline: help when lost, help during a task, an app for relatives.
- **2026-10-08** — First round of feedback read and acted on: 11 causes fixed, 18 new tests, larger speech model with the user's vocabulary, hand correction in confirmations, relationship of a known person, change of place.
- **2026-10-08** — The place of an event is looked for on the map around the user. Guideline: the path to a phone in three steps.
- **2026-10-08** — iPhone prototype: `start-phone.bat`, secure address with the computer's own certificate, code, home-screen icon, microphone and voice adapted to the iPhone. Project saved on GitHub.
- **2026-10-07** — Improvement mode: a verdict after each request, saved for improving the app. An event now needs a place and a person, and the app asks for them.
