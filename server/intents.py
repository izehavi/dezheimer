"""Finds what the user wants from the meaning of a sentence, not from fixed keywords.

A very small sentence-embedding model (about 90 MB, fast on a processor, small
enough for a phone) turns a sentence into numbers that capture its meaning. The
sentence is compared with example sentences for each intent, and the closest
example wins. "Add to my agenda", "I plan to go" and "I'm seeing Paul on Friday"
all land near the same examples.

Names are replaced by a neutral one before comparing, so that a sentence is
judged on what it asks and not on who it mentions.

Two simple rules help the model where meaning alone is ambiguous:
- a question can only be a request for information, and a statement can only be
  something to write down ("Who is Rose?" against "Rose is Paul's cousin");
- a few opening words are strong hints ("Remember that...", "Search for...").

To make an intent more robust, add example sentences to EXAMPLES.
"""

import os
import re
import threading

MODEL_NAME = os.environ.get("DEZHEIMER_INTENT_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
MIN_SCORE = 0.42   # below this similarity, the sentence is not understood

EXAMPLES = {
    "add_event": [
        "Add this to my agenda.",
        "Add a coffee with Sarah to my agenda tomorrow at 3 pm.",
        "Put a dentist appointment in my calendar on Friday at 10.",
        "I plan to go to the market tomorrow morning.",
        "I'm having lunch with Paul on Sunday at noon.",
        "I'm going to the cinema with Rose on Saturday evening.",
        "I have an appointment with the doctor next Monday at ten thirty.",
        "Remind me that I have a meeting on Thursday at 2 pm.",
        "Remind me to go to the hairdresser on Tuesday at 11.",
        "Schedule a phone call with David tomorrow at 6 pm.",
        "I will see Emma on Wednesday afternoon.",
        "We are going to the restaurant on the 12th of October at 8 pm.",
        "Book a walk in the park with Rose on Friday at 3.",
        "I need to be at the pharmacy tomorrow at 9.",
        "Sarah is coming for dinner on Saturday at 7.",
        "Tomorrow at 5 I'm meeting Nadia at the bakery.",
        "I plan to go swimming with Leo on Thursday at 4.",
        "Lunch with Rose on Friday at one.",
        "David will visit me on Sunday at 3 pm.",
        "I want to go alone to the park at 2 pm.",
        "I want to go to the swimming pool on Monday at 5.",
        "I would like to go to the library tomorrow at 4.",
        "Add a meeting at 11 am with Paul.",
    ],
    "change_event": [
        "Move my appointment with the doctor to Monday at 10 30.",
        "Change the lunch with Sarah to 1 pm.",
        "Postpone the walk with Rose to Saturday.",
        "Reschedule the dentist to next Thursday at 3.",
        "The dinner with David is now at 8 pm.",
        "Push back my meeting to 4 o'clock.",
        "Can you move the coffee with Paul to tomorrow?",
        "Change the time of my appointment to 11.",
        "My appointment with Dr. Martin has been moved to Friday.",
        "Change the day of the birthday lunch to Sunday.",
        "Bring forward the hairdresser to 9 in the morning.",
        "The video call with Leo will be at 6 instead.",
        "Change the place of the meeting with Paul to the library.",
        "Change the place of the lunch with Sarah tomorrow.",
        "Move the dinner with David to the Italian restaurant.",
        "The coffee with Rose will be at the bakery instead.",
    ],
    "cancel_event": [
        "Cancel my appointment with the doctor.",
        "Cancel the lunch with Sarah tomorrow.",
        "Remove the walk with Rose from my agenda.",
        "Delete the dentist appointment on Friday.",
        "I'm not going to the market tomorrow anymore.",
        "The dinner with David is cancelled.",
        "Take the coffee with Paul off my calendar.",
        "Erase my meeting on Thursday.",
        "Forget the video call with Leo.",
        "Sarah is not coming for lunch after all.",
        "I don't have the hairdresser on Tuesday anymore.",
        "The appointment tomorrow is off.",
    ],
    "add_person": [
        "Add a new person.",
        "Add a new person, her name is Julie.",
        "I want to add someone new, his name is Marc.",
        "I met a new person called Marc at the bridge club.",
        "Create a new contact named Anne, she is Rose's daughter.",
        "This is Tom, he is my nephew.",
        "Remember a new person: Claire, my daughter-in-law.",
        "I have a new neighbour called Lucy.",
        "A new person, Monica.",
        "Add a new person, Victor.",
        "Paul is my brother.",
        "She is my sister.",
        "Add my cousin Peter to my people.",
        "Save a new friend, her name is Helen and I know her from the choir.",
        "I would like to register a new person named Jack.",
    ],
    "add_connection": [
        "Julie is Sarah's daughter.",
        "Tom is the husband of Emma.",
        "Paul and Rose are cousins.",
        "Add a connection: Marc is David's colleague.",
        "Claire is married to David.",
        "Anne is the daughter of Rose.",
        "Leo and Emma are brother and sister.",
        "Link Julie and Sarah, they are sisters.",
        "Nadia knows Rose, they are friends.",
        "Peter is Paul's brother.",
        "Monica is the sister of Rose.",
        "Victor and Paul are neighbours.",
        "Alice is Nadia's mother.",
        "Hugo is Emma's boyfriend.",
    ],
    "add_memo": [
        "Remember that Emma won her riding competition.",
        "Note that Paul broke his arm.",
        "Write down that the radiator must be replaced before winter.",
        "Make a note: Sarah is changing jobs next month.",
        "Sarah told me she is moving to a new house.",
        "Keep in mind that David is expecting a baby in the spring.",
        "Don't forget that Rose's daughter is coming for Christmas.",
        "Add a memo about Leo: he started a new job at a bookshop.",
        "I want to remember that my keys are in the blue bowl.",
        "Save this: Nadia's son started school.",
        "Rose said her knee is much better.",
        "Remember that Leo passed his exams.",
        "Please write down that Rose is allergic to nuts.",
        "Note for later: the garage code is 4 5 1 2.",
        "David told me he bought a new car.",
        "Make a note that the spare key is under the flower pot.",
        "Note: the plumber's phone number is on the fridge.",
        "Memo about Paul: he is starting a new job on Monday.",
        "Memo about Rose. She is going to move to Paris in March.",
        "Add an information about Sarah: she has a new cat.",
        "I want to add an information about David.",
        "Leo works in chemistry.",
        "Emma, she is working in a hospital.",
    ],
    "ask_agenda": [
        "What do I have today?",
        "What is my plan for today?",
        "What is planned tomorrow?",
        "What am I doing on Friday?",
        "Do I have something this afternoon?",
        "What is my next appointment?",
        "When do I see Sarah?",
        "When is my appointment with the doctor?",
        "Tell me my schedule for the day.",
        "Is there anything in my agenda this week?",
        "Who is coming today?",
        "What do I have to do tomorrow morning?",
        "Read me my agenda.",
        "What's on today?",
        "What's happening tomorrow?",
        "When am I seeing Paul?",
        "What's next?",
        "Am I free on Thursday afternoon?",
        "Do I have anything planned for Saturday?",
    ],
    "ask_diary": [
        "What did I do yesterday?",
        "What happened on Sunday?",
        "Tell me about my day yesterday.",
        "What did I do last Monday?",
        "Read me my diary.",
        "Who did I see yesterday?",
        "What happened two days ago?",
        "Remind me what I did this week.",
    ],
    "ask_person": [
        "Who is Rose?",
        "Tell me about Paul.",
        "How do I know Rose?",
        "Where did I meet Paul?",
        "What is new with Emma?",
        "What is the latest news about David?",
        "Remind me who Nadia is.",
        "Who is Sarah to me?",
        "What do I know about Leo?",
        "How is Emma doing?",
        "Do I know someone called Martin?",
        "Tell me about my daughter.",
        "Who is my doctor?",
        "What's the news from Leo?",
        "Give me some information about Nadia.",
        "Information about Rose.",
        "I want some information about Paul.",
        "I want to know the link between David and me.",
        "What is the link between Rose and me?",
        "How is Paul related to me?",
        "What is my connection with Sarah?",
        "What do you know about Emma?",
    ],
    "search": [
        "Search for the radiator.",
        "Look for Canada in my notes.",
        "Find what I noted about the boiler.",
        "Search my memory for the word tennis.",
        "Find the riding competition.",
        "Where are my keys?",
        "What did I note about the car?",
        "Look up the bookshop.",
        "Search for apples.",
        "Find anything about Italy.",
        "Look for the garage code.",
        "Search for the word holiday.",
        "Find the plumber.",
        "Search my notes for the birthday present.",
    ],
    "ask_time": [
        "What time is it?",
        "What day is it today?",
        "What is the date today?",
        "Which day are we?",
        "What month are we in?",
        "Tell me the time please.",
    ],
    "help": [
        "What can you do?",
        "Help me.",
        "How does this work?",
        "What can I ask you?",
        "I don't know what to say.",
        "What are you for?",
    ],
    # Ordinary talk. A sentence closest to these is not a request.
    None: [
        "It is a lovely day.",
        "Thank you very much.",
        "The soup is too hot.",
        "Hmm, let me think.",
        "It is raining again.",
        "I am a bit tired.",
        "That is nice.",
        "Okay, good.",
        "Yes please.",
        "I like this song.",
        "Would you like some tea?",
        "Good morning, how are you?",
        "The weather is cold today.",
    ],
}

# Capitalized words that are not people's names.
_NOT_NAMES = {
    "i", "i'm", "i'd", "i'll", "i've", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
    "sunday", "january", "february", "march", "april", "may", "june", "july", "august", "september",
    "october", "november", "december", "christmas", "easter", "dr", "doctor", "mr", "mrs", "ms",
}
# Words after which a sentence-opening capitalized word is taken as a name: "Julie is...", "Paul and...".
_AFTER_A_NAME = r"(?:is|and|told|said|says|has|was|will|knows|wants|loves|,|'s)\b"
_OPENERS = {
    "it", "he", "she", "we", "they", "this", "that", "there", "what", "who", "when", "where", "how",
    "lunch", "dinner", "breakfast", "coffee", "tea", "tomorrow", "today", "tonight", "yesterday", "everything",
}


# Requests for information. Everything else writes something down.
QUESTIONS = {"ask_agenda", "ask_diary", "ask_person", "ask_time", "search", "help"}
STATEMENTS = {
    "add_event", "change_event", "cancel_event", "add_person", "add_connection", "add_memo", "search", "help",
}

_ASKING = re.compile(
    r"^\W*(?:please\s+)?(?:what|when|who|whom|where|how|which|why|do|does|did|is|are|am|was|were|can|could|will"
    r"|any|tell me|read me|show me|give me|remind me (?:who|what|when|where|how)"
    r"|(?:i (?:want|would like|'d like|need) )?to know|(?:i (?:want|would like|'d like|need) )?(?:some )?(?:information|info))\b",
    re.I,
)
# Opening words that point to one intent. They add to its score.
_HINTS = [
    ("add_memo", 0.2, re.compile(
        r"^\W*(?:please\s+)?(?:remember|note|write (?:this )?down|make a note|keep in mind|don'?t forget"
        r"|keep a (?:memo|note)|add a (?:memo|note)|save this|memo)\b", re.I)),
    ("add_memo", 0.2, re.compile(r"\b(?:told me|said that|says that|tells me)\b", re.I)),
    # "Memo about Paul", also when the speech model writes "Mimo"; "add an information about Paul".
    ("add_memo", 0.45, re.compile(
        r"^\W*m[ie]m+o\b|\badd (?:an? |some )?(?:information|info|memo|note)\b", re.I)),
    ("search", 0.3, re.compile(r"^\W*(?:please\s+)?(?:search|find|look (?:for|up))\b", re.I)),
    ("add_event", 0.2, re.compile(r"\b(?:agenda|calendar|appointment|schedule)\b", re.I)),
    ("cancel_event", 0.3, re.compile(
        r"\b(?:cancel(?:led|ed)?|delete|erase|remove|hide|not (?:going|coming)|anymore|any more)\b", re.I)),
    ("change_event", 0.3, re.compile(
        r"\b(?:move[ds]?|reschedule[ds]?|postpone[ds]?|push(?:ed)? back|bring forward|change (?:the|my)|is now"
        r"|instead)\b", re.I)),
    ("add_person", 0.2, re.compile(
        r"\b(?:new (?:person|friend|neighbou?r|contact)|i (?:just |have just )?met|(?:his|her|their) name is"
        r"|called|named)\b", re.I)),
]
_POLITE = re.compile(r"^\W*(?:please\s+)?(?:can|could|will|would) you\s+(?:please\s+)?", re.I)


def is_question(text):
    polite = _POLITE.match(text)
    if polite:
        # "Can you tell me who Rose is?" is a question; "Can you add a lunch on Friday?" is an order.
        return bool(_ASKING.match(text[polite.end():]))
    return text.rstrip().endswith("?") or bool(_ASKING.match(text))


def neutral(text, known_names=()):
    """Replace people's names by "Alex", so that only the meaning of the request is compared."""
    for name in sorted(known_names, key=len, reverse=True):
        text = re.sub(rf"\b{re.escape(name)}\b", "Alex", text, flags=re.I)

    def swap(match):
        word, start = match.group(0), match.start()
        if word.lower() in _NOT_NAMES:
            return word
        opening = start == 0 or text[:start].rstrip()[-1:] in ".!?:"
        if not opening:
            return "Alex"
        follows = re.match(rf"\s*{_AFTER_A_NAME}", text[match.end():])
        return "Alex" if follows and word.lower() not in _OPENERS else word

    return re.sub(r"\b[A-Z][a-z]+(?:'[a-z]+)?\b(?<!'s)", swap, text)


class IntentClassifier:
    def __init__(self):
        self.ready = False
        self._lock = threading.Lock()

    def load_in_background(self):
        threading.Thread(target=self._load, daemon=True).start()

    def _load(self):
        with self._lock:
            if self.ready:
                return
            from transformers import AutoModel, AutoTokenizer

            # On the processor: the model is tiny, and this keeps the graphics card free.
            self._tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
            self._model = AutoModel.from_pretrained(MODEL_NAME).eval()
            self._labels = [intent for intent, examples in EXAMPLES.items() for _ in examples]
            self._examples = self._embed([neutral(e) for examples in EXAMPLES.values() for e in examples])
            self.ready = True

    def _embed(self, sentences):
        import torch

        batch = self._tokenizer(sentences, padding=True, truncation=True, max_length=64, return_tensors="pt")
        with torch.no_grad():
            tokens = self._model(**batch).last_hidden_state
        # A sentence is the average of its words, ignoring the padding.
        mask = batch["attention_mask"].unsqueeze(-1).float()
        sentence = (tokens * mask).sum(1) / mask.sum(1)
        return torch.nn.functional.normalize(sentence, dim=1)

    def classify(self, text, known_names=()):
        """Return (intent, score). The intent is None when nothing is close enough."""
        if not self.ready:
            self._load()
        scores = (self._embed([neutral(text, known_names)]) @ self._examples.T)[0]
        best = {}
        for label, score in zip(self._labels, scores.tolist()):
            best[label] = max(best.get(label, -1.0), score)

        hinted = set()
        for label, bonus, pattern in _HINTS:
            if pattern.search(text) and label not in hinted:
                best[label] += bonus
                hinted.add(label)

        allowed = QUESTIONS if is_question(text) else STATEMENTS
        intent = max((label for label in best if label in allowed or label is None), key=best.get)
        score = round(best[intent], 3)
        # A hint is evidence by itself, so a hinted intent does not need a high score.
        understood = intent is not None and (score >= MIN_SCORE or intent in hinted)
        return (intent if understood else None), score


classifier = IntentClassifier()
