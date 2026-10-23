# Dezheimer — Needs of a person with Alzheimer's

What a person living with Alzheimer's at home most needs help with, ordered from the most disabling to the least, and the constraints any tool for them must respect. The people memos are no longer the priority; this document is the base for choosing what to build next.

**Written:** 2026-10-21, from the project owner's list (marked ★) completed with published research (sources at the end).

**Scope:** a person at an early to moderate stage, still living at home. At later stages the needs are physical care, where a phone helps little.

## 1. Needs, from the most disabling to the least

Three tiers: danger to life or health, then the loss of the ability to live alone, then the quality of life. Inside each tier, the most disabling comes first.

### Tier 1 — Danger to life or health

| # | Need | Why it ranks here |
| --- | --- | --- |
| 1 | **Getting lost, wandering** ★ (orientation) | About 6 people in 10 with dementia wander and get lost at least once. Sources disagree on how many die when not found within 24 hours (from 33% to 60%); 93% survive when found within 12 hours. Includes not knowing where one is, why one is there, or how to get home. |
| 2 | **Medication errors** ★ (pills) | Missed and double doses are both dangerous. People with dementia are about 3 times more likely to be hospitalised for a medication problem (14% against 4.2%). Living alone doubles the risk of medication errors. |
| 3 | **Dangers at home** | Stove left on, fire, flooding, door left open, a stranger let in. The dangerous side of ★ cooking. |
| 4 | **Scams and financial abuse** | Handling money is one of the first abilities lost, and scammers target these people. |
| 5 | **Nobody notices when something goes wrong** ★ (remote supervision by relatives) | About a third of people with Alzheimer's live alone. A fall, an illness or a slow decline can go unseen for days. |

### Tier 2 — Losing the ability to live alone

| # | Need | Why it ranks here |
| --- | --- | --- |
| 6 | **Eating, drinking, hygiene** ★ (breakfast) | Forgotten meals lead to malnutrition, dehydration and self-neglect. |
| 7 | **Daily routine and complex tasks** ★ (cooking, appliances, shopping) | These everyday tasks are lost long before basic self-care (dressing, washing). They decide whether the person can stay at home. |
| 8 | **Losing track of time and of the agenda** ★ | Not knowing the day, missed appointments, the same question asked again and again. Repeated questions are one of the main sources of stress for caregivers. |
| 9 | **Losing objects** (keys, glasses, wallet) | Every day, causes anxiety, and often leads to accusing others of theft. |

### Tier 3 — Quality of life

| # | Need | Why it ranks here |
| --- | --- | --- |
| 10 | **Loneliness, anxiety, low mood** ★ | 58 to 62% of people with dementia feel lonely (62% of those who live alone, against 24% of people over 55), and 63% feel anxious or depressed. **Distress is the need people with dementia rate first themselves.** Company and things to do in the day are the needs most often left unmet, according to patients, carers and professionals. |
| 11 | **Loss of meaningful activity and of identity** | 70% have stopped doing things they used to do, for lack of confidence. Asked what matters most, people with dementia name meaningful activities, staying connected, and their sense of self. |
| 12 | **Remembering news about loved ones, recognising people** ★ (the people memos) | Matters for social life, but less disabling than everything above. |

Tiers 1 and 2 are what worries the caregivers; tier 3 is what the person feels. The research shows that the two lists differ, so the app must serve both.

## 2. Constraints of use

### Body and senses

- **Sight.** Poor near vision (presbyopia, cataract), glasses often lost. Very large text and strong contrast; voice must not depend on the screen.
- **Hearing.** About a third of people over 65 hear badly, and dementia makes it worse. A spoken reminder can go unheard: there must be another way (vibration, light, a relative's phone).
- **Hands.** Tremor and stiff fingers: small buttons, swipes, long presses and double taps are hard.
- **Voice.** Slower, quieter, with more pauses. Hard for speech recognition, which is already the weak point of the app.

### Memory and thinking

- **They forget the tool exists.** The app must speak first: a tool the person must remember to open does not work. This is the most important constraint.
- **They cannot learn new things.** Memory of recent facts goes first; habits learned by repetition last longer. One button, the same screen every day, and ideally a device the person already knows.
- **They forget the phone itself.** Left at home or not charged, and then help when lost fails exactly when it is needed.
- **What they tell the app is not reliable.** "I took my pills" may be false, and a "yes" may be said without understanding. This matters for the pills and for every confirmation.
- **They may not know they are ill.** About 24% are fully unaware of their memory problem and 26% partly. They do not see why they need the app and may refuse it.
- **An alert can frighten them.** An unexpected voice can cause anxiety or confusion ("who is talking?"). Always calm, never like a test (guideline, principle 4).
- **The disease progresses.** What works this year will not work next year. The caregiver must be able to simplify the app over time.

### Technology and the people around

- Many do not own a smartphone or have Wi-Fi, and know little of digital tools. Setting up must be done by someone else.
- The caregiver is often an elderly husband or wife, not at ease with technology either.
- **Watching and freedom.** Remote supervision needs the person's consent and must respect their dignity.

## 3. Where this meets the current app

Two limits written in [CHECKPOINT.md](CHECKPOINT.md) block the top needs directly:

- **Reminders only come while the app is open.** This blocks the pills, the routine, and "the app must speak first".
- **The phone needs the computer to be switched on.** This blocks help when lost outside the home.

There is also no screen for relatives yet, which supervision needs.

## 4. Next step

The project owner picks which needs the app can address, and they are then ordered from the easiest to address to the hardest.

Addressed so far, in a first version:

- **Getting lost** (need 1), 2026-10-21: "Take me there", the way watched, help when lost, the relatives told.
- **Medication errors** (need 2) and **eating, drinking, hygiene** (need 6), 2026-10-23. Of the ways to know whether a thing is done (asking afterwards, a note at the moment, a pill box, a photo, the relatives told, sensors at home, a locking pill dispenser, a camera), the project owner chose three: **a note at the moment** (a reminder that works when the app is closed, and one big button), **the pill box** as the answer when nothing was noted, and **the relatives told** when the pills are not noted after 45 minutes, a meal or a drink after 2 hours.

## Sources

- [CANE study of unmet needs of people with dementia at home (BMC Health Services Research)](https://discovery-pp.ucl.ac.uk/id/eprint/1388602/1/1472-6963-13-43.pdf)
- [Decline in complex everyday activities along the Alzheimer's continuum](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7597034/)
- [Wandering and missing incidents in dementia](https://pmc.ncbi.nlm.nih.gov/articles/PMC11485082)
- [University of Florida: search for wandering Alzheimer's patients](https://archive.news.ufl.edu/articles/2001/10/uf-nurse-researcher-identifies-search-criteria-for-wandering-alzheimers-patient.html)
- [Medication nonadherence in older adults with cognitive impairment who live alone (UCSF)](https://livingalone.ucsf.edu/node/616)
- [Medication adherence in older patients with dementia, systematic review (Griffith University)](https://research-repository.griffith.edu.au/items/3d2e6f9f-6a16-4c5e-889e-1648b3e3af3c)
- [Millions of aging Americans are facing dementia by themselves (Scientific American)](https://www.scientificamerican.com/article/millions-of-aging-americans-are-facing-dementia-by-themselves/)
- [Living alone with cognitive impairment, best practices (UCSF)](https://geriatrics.ucsf.edu/sites/geriatrics.ucsf.edu/files/2018-06/livingalonebestpractices.pdf)
- [Elder abuse at home: why people living with dementia are at risk (RTI)](https://www.rti.org/insights/elder-abuse-home-why-people-living-dementia-are-risk)
- [Loneliness, a major problem for people with dementia (Mental Health Today)](https://mentalhealthtoday.co.uk/loneliness-major-problem-for-people-with-dementia-report-says)
- [People living alone with dementia (Alzheimer's Society)](https://www.alzheimers.org.uk/cy/node/33576)
- [When a parent does not know he has dementia: anosognosia (Next Avenue)](https://www.nextavenue.org/parent-doesnt-recognize-dementia/)
- [Repetitive questioning exasperates caregivers](https://etsu.elsevierpure.com/en/publications/repetitive-questioning-exasperates-caregivers/)
- [Smartphone and tablet use by older adults with and without cognitive impairment, systematic review](https://livrepository.liverpool.ac.uk/3151760/)
- [Smartphone use by people with dementia (JMIR, 2020)](https://www.jmir.org/2020/6/e17253/)
- [Concurrent vision and hearing impairment and dementia](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8680151/)
- [Voice assistants used by family and professionals supporting people with cognitive impairment](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11285577/)
- [Re-purposing voice assistant technology for people living with dementia (Northumbria University)](https://researchportal.northumbria.ac.uk/en/publications/re-purposing-voice-assistant-technology-for-use-by-people-living-/)
- [What matters most in everyday life to people living with dementia](https://pmc.ncbi.nlm.nih.gov/articles/PMC8888776)
