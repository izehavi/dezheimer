"""What the user wants, for requests said in French. The same method as intents.py.

The sentence model is one made for many languages (about 120 M parameters, still small
enough for a phone), compared with the French example sentences below. Names are
replaced by a neutral one, and a few French opening words are strong hints.
"""

import re

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

EXAMPLES = {
    "add_event": [
        "Ajoute ça à mon agenda.",
        "Ajoute un café avec Sarah demain à 15 heures dans mon agenda.",
        "Mets un rendez-vous chez le dentiste vendredi à 10 heures.",
        "Je vais au marché demain matin.",
        "J'ai envie d'aller grimper avec Sarah.",
        "Je veux aller nager avec Paul vendredi.",
        "On prend un café avec Rose demain.",
        "Je déjeune avec Paul dimanche à midi.",
        "Je vais au cinéma avec Rose samedi soir.",
        "J'ai rendez-vous chez le médecin lundi prochain à 10 heures 30.",
        "Rappelle-moi que j'ai une réunion jeudi à 14 heures.",
        "Rappelle-moi d'aller chez le coiffeur mardi à 11 heures.",
        "Prévois un appel avec David demain à 18 heures.",
        "Je vois Emma mercredi après-midi.",
        "On va au restaurant le 12 octobre à 20 heures.",
        "Une promenade au parc avec Rose vendredi à 15 heures.",
        "Je dois être à la pharmacie demain à 9 heures.",
        "Sarah vient dîner samedi à 19 heures.",
        "Demain à 17 heures je retrouve Nadia à la boulangerie.",
        "Déjeuner avec Rose vendredi à 13 heures.",
        "David vient me voir dimanche à 15 heures.",
        "Je veux aller seule au parc à 14 heures.",
        "Je voudrais aller à la bibliothèque demain à 16 heures.",
        "Ajoute une réunion à 11 heures avec Paul.",
        "Nouveau rendez-vous avec le kiné jeudi.",
    ],
    "change_event": [
        "Déplace mon rendez-vous chez le médecin à lundi 10 heures 30.",
        "Change le déjeuner avec Sarah à 13 heures.",
        "Repousse la promenade avec Rose à samedi.",
        "Décale le dentiste à jeudi prochain 15 heures.",
        "Le dîner avec David est maintenant à 20 heures.",
        "Recule ma réunion à 16 heures.",
        "Tu peux déplacer le café avec Paul à demain ?",
        "Change l'heure de mon rendez-vous à 11 heures.",
        "Mon rendez-vous avec le docteur Martin a été déplacé à vendredi.",
        "Change le jour du déjeuner d'anniversaire à dimanche.",
        "Avance le coiffeur à 9 heures du matin.",
        "L'appel vidéo avec Léo sera plutôt à 18 heures.",
        "Change le lieu de la réunion avec Paul à la bibliothèque.",
        "Change l'endroit du déjeuner avec Sarah demain.",
        "Déplace le dîner avec David au restaurant italien.",
        "Le café avec Rose sera plutôt à la boulangerie.",
    ],
    "cancel_event": [
        "Annule mon rendez-vous chez le médecin.",
        "Annule le déjeuner avec Sarah demain.",
        "Enlève la promenade avec Rose de mon agenda.",
        "Supprime le rendez-vous chez le dentiste vendredi.",
        "Je ne vais plus au marché demain.",
        "Le dîner avec David est annulé.",
        "Retire le café avec Paul de mon agenda.",
        "Efface ma réunion de jeudi.",
        "Oublie l'appel vidéo avec Léo.",
        "Sarah ne vient plus déjeuner finalement.",
        "Je n'ai plus le coiffeur mardi.",
        "Le rendez-vous de demain n'a plus lieu.",
    ],
    "add_person": [
        "Ajoute une nouvelle personne.",
        "Ajoute une nouvelle personne, elle s'appelle Julie.",
        "Je veux ajouter quelqu'un de nouveau, il s'appelle Marc.",
        "J'ai rencontré une nouvelle personne qui s'appelle Marc au club de bridge.",
        "Crée un nouveau contact nommé Anne, c'est la fille de Rose.",
        "Voici Tom, c'est mon neveu.",
        "Retiens une nouvelle personne : Claire, ma belle-fille.",
        "J'ai une nouvelle voisine qui s'appelle Lucie.",
        "Une nouvelle personne, Monique.",
        "Ajoute une nouvelle personne, Victor.",
        "Paul est mon frère.",
        "Elle est ma sœur.",
        "C'est ma sœur.",
        "Ajoute mon cousin Pierre à mes proches.",
        "Une nouvelle amie, elle s'appelle Hélène, je la connais de la chorale.",
    ],
    "add_connection": [
        "Julie est la fille de Sarah.",
        "Tom est le mari d'Emma.",
        "Paul et Rose sont cousins.",
        "Ajoute un lien : Marc est le collègue de David.",
        "Claire est mariée avec David.",
        "Anne est la fille de Rose.",
        "Léo et Emma sont frère et sœur.",
        "Relie Julie et Sarah, elles sont sœurs.",
        "Nadia connaît Rose, elles sont amies.",
        "Pierre est le frère de Paul.",
        "Monique est la sœur de Rose.",
        "Victor et Paul sont voisins.",
        "Alice est la mère de Nadia.",
        "Hugo est le copain d'Emma.",
    ],
    "add_memo": [
        "Rappelle-toi qu'Emma a gagné son concours d'équitation.",
        "Note que Paul s'est cassé le bras.",
        "Écris que le radiateur doit être changé avant l'hiver.",
        "Prends note : Sarah change de travail le mois prochain.",
        "Sarah m'a dit qu'elle déménage dans une nouvelle maison.",
        "Garde en mémoire que David attend un bébé au printemps.",
        "N'oublie pas que la fille de Rose vient pour Noël.",
        "Ajoute une note sur Léo : il a commencé un nouveau travail dans une librairie.",
        "Je veux me souvenir que mes clés sont dans le bol bleu.",
        "Retiens ça : le fils de Nadia a commencé l'école.",
        "Rose a dit que son genou va beaucoup mieux.",
        "Souviens-toi que Léo a réussi ses examens.",
        "Note bien que Rose est allergique aux noix.",
        "Note pour plus tard : le code du garage est 4 5 1 2.",
        "David m'a dit qu'il a acheté une nouvelle voiture.",
        "Note que la clé de secours est sous le pot de fleurs.",
        "Note : le numéro du plombier est sur le frigo.",
        "Mémo sur Paul : il commence un nouveau travail lundi.",
        "Mémo sur Rose. Elle va déménager à Paris en mars.",
        "Ajoute une information sur Sarah : elle a un nouveau chat.",
        "Je veux ajouter une information sur David.",
        "Léo travaille dans la chimie.",
        "Emma, elle travaille dans un hôpital.",
    ],
    "ask_agenda": [
        "Qu'est-ce que j'ai aujourd'hui ?",
        "Quel est mon programme aujourd'hui ?",
        "Qu'est-ce qui est prévu demain ?",
        "Qu'est-ce que je fais vendredi ?",
        "Est-ce que j'ai quelque chose cet après-midi ?",
        "Quel est mon prochain rendez-vous ?",
        "Quand est-ce que je vois Sarah ?",
        "C'est quand mon rendez-vous chez le médecin ?",
        "Dis-moi ce que j'ai aujourd'hui.",
        "Il y a quelque chose dans mon agenda cette semaine ?",
        "Qui vient aujourd'hui ?",
        "Qu'est-ce que je dois faire demain matin ?",
        "Lis-moi mon agenda.",
        "Qu'est-ce qu'il y a aujourd'hui ?",
        "Qu'est-ce qui se passe demain ?",
        "Quand est-ce que je vois Paul ?",
        "C'est quand que je vois Rose ?",
        "Je vois Sarah quand ?",
        "C'est quoi la suite ?",
        "Est-ce que je suis libre jeudi après-midi ?",
        "J'ai quelque chose de prévu samedi ?",
    ],
    "ask_diary": [
        "Qu'est-ce que j'ai fait hier ?",
        "Que s'est-il passé dimanche ?",
        "Raconte-moi ma journée d'hier.",
        "Qu'est-ce que j'ai fait lundi dernier ?",
        "Lis-moi mon journal.",
        "Qui est-ce que j'ai vu hier ?",
        "Que s'est-il passé il y a deux jours ?",
        "Rappelle-moi ce que j'ai fait cette semaine.",
    ],
    "ask_person": [
        "Qui est Rose ?",
        "Parle-moi de Paul.",
        "Comment je connais Rose ?",
        "Où est-ce que j'ai rencontré Paul ?",
        "Quoi de neuf pour Emma ?",
        "Quelles sont les dernières nouvelles de David ?",
        "Rappelle-moi qui est Nadia.",
        "Qui est Sarah pour moi ?",
        "Qu'est-ce que je sais sur Léo ?",
        "Comment va Emma ?",
        "Est-ce que je connais quelqu'un qui s'appelle Martin ?",
        "Parle-moi de ma fille.",
        "Qui est mon médecin ?",
        "Des nouvelles de Léo ?",
        "Donne-moi des informations sur Nadia.",
        "Des informations sur Rose.",
        "Je veux des informations sur Paul.",
        "Je veux savoir le lien entre David et moi.",
        "Quel est le lien entre Rose et moi ?",
        "Quelle est ma relation avec Sarah ?",
        "Qu'est-ce que tu sais sur Emma ?",
    ],
    "search": [
        "Cherche le radiateur.",
        "Cherche Canada dans mes notes.",
        "Trouve ce que j'ai noté sur la chaudière.",
        "Cherche le mot tennis.",
        "Trouve le concours d'équitation.",
        "Où sont mes clés ?",
        "Qu'est-ce que j'ai noté sur la voiture ?",
        "Recherche la librairie.",
        "Cherche les pommes.",
        "Trouve quelque chose sur l'Italie.",
        "Cherche le code du garage.",
        "Cherche le mot vacances.",
        "Trouve le plombier.",
        "Cherche dans mes notes le cadeau d'anniversaire.",
    ],
    "ask_time": [
        "Quelle heure est-il ?",
        "Quel jour sommes-nous ?",
        "Quelle est la date d'aujourd'hui ?",
        "On est quel jour ?",
        "En quel mois sommes-nous ?",
        "Dis-moi l'heure s'il te plaît.",
    ],
    "help": [
        "Qu'est-ce que tu sais faire ?",
        "Aide-moi.",
        "Comment ça marche ?",
        "Qu'est-ce que je peux te demander ?",
        "Je ne sais pas quoi dire.",
        "À quoi tu sers ?",
    ],
    # Ordinary talk. A sentence closest to these is not a request.
    None: [
        "Il fait beau aujourd'hui.",
        "Merci beaucoup.",
        "La soupe est trop chaude.",
        "Hum, laisse-moi réfléchir.",
        "Il pleut encore.",
        "Je suis un peu fatiguée.",
        "C'est gentil.",
        "D'accord, très bien.",
        "Oui s'il te plaît.",
        "J'aime bien cette chanson.",
        "Tu veux un thé ?",
        "Bonjour, comment ça va ?",
        "Il fait froid aujourd'hui.",
    ],
}

# Capitalized words that are not people's names.
NOT_NAMES = {
    "je", "j", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche", "janvier", "février",
    "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre", "noël",
    "pâques", "dr", "docteur", "monsieur", "madame", "mme", "m",
}
# Words after which a sentence-opening capitalized word is taken as a name: "Julie est...", "Paul et...".
AFTER_A_NAME = r"(?:est|et|m'a|a|dit|va|vient|sera|connaît|veut|aime|,)\b"
OPENERS = {
    "il", "elle", "on", "nous", "ils", "elles", "ce", "c", "ça", "qu", "que", "qui", "quand", "où", "comment",
    "déjeuner", "dîner", "café", "thé", "demain", "aujourd", "hier", "ce", "tout",
}

ASKING = re.compile(
    r"^\W*(?:s'il te pla[iî]t\s+)?(?:qu['’]est-ce|que|quand|qui|o[uù]|comment|quel|quelle|quels|quelles|pourquoi|combien"
    r"|est-ce|ai-je|suis-je|y a-t-il|dis-moi|lis-moi|montre-moi|donne-moi|raconte-moi|parle-moi|rappelle-moi (?:qui|ce|quand|o[uù]|comment)"
    r"|(?:je (?:veux|voudrais|aimerais) )?savoir|(?:je (?:veux|voudrais|aimerais) )?(?:des )?(?:informations?|infos?|nouvelles)"
    r"|des nouvelles|c['’]est (?:qui|quand|quoi)|on est quel)(?![a-zà-ÿ])",
    re.I,
)
# Opening words that point to one intent. They add to its score.
HINTS = [
    ("add_memo", 0.2, re.compile(
        r"^\W*(?:s'il te pla[iî]t\s+)?(?:rappelles?-toi|souviens-toi|retiens|note|prends note|[ée]cris|n['’]oublie pas"
        r"|garde en m[ée]moire|je veux me souvenir|m[ée]mo)(?![a-zà-ÿ])", re.I)),
    ("add_memo", 0.2, re.compile(r"\b(?:m['’]a dit|a dit que|dit que|m['’]a racont[ée])", re.I)),
    ("add_memo", 0.45, re.compile(r"^\W*m[ée]mo\b|\b(?:ajoute|mets) (?:une |un )?(?:information|info|note|m[ée]mo)\b", re.I)),
    ("search", 0.3, re.compile(r"^\W*(?:s'il te pla[iî]t\s+)?(?:cherche|trouve|recherche)\b", re.I)),
    ("add_event", 0.2, re.compile(r"\b(?:agenda|calendrier|rendez-vous|rdv)\b", re.I)),
    ("ask_agenda", 0.15, re.compile(r"\bquand\b|\bpr[ée]vu\b|\bprochain rendez-vous\b", re.I)),
    ("cancel_event", 0.3, re.compile(
        r"\b(?:annule[rz]?|annul[ée]e?|supprime[rz]?|efface[rz]?|enl[eè]ve[rz]?|enlever|retire[rz]?|oublie[rz]?"
        r"|ne \w+ plus|n['’]\w+ plus|plus lieu)\b", re.I)),
    ("change_event", 0.3, re.compile(
        r"\b(?:d[ée]place[rz]?|d[ée]plac[ée]e?|d[ée]cale[rz]?|repousse[rz]?|reporte[rz]?|recule[rz]?|avance[rz]?"
        r"|change[rz]? (?:le|la|l['’]|mon|ma)"
        r"|est maintenant|sera plut[oô]t|plut[oô]t)\b", re.I)),
    ("add_person", 0.2, re.compile(
        r"\b(?:nouvelle personne|nouvel ami|nouvelle amie|nouveau voisin|nouvelle voisine|nouveau contact"
        r"|j['’]ai rencontr[ée]|s['’]appelle|nomm[ée]e?|son nom est)\b", re.I)),
]
# "J'ai envie d'aller grimper avec Elinor ?": a wish, even when it sounds like a question.
WISH = re.compile(r"^\W*(?:je |on |nous )?(?:veux|voudrais|aimerais|vais|va|allons|ai envie d)(?![a-zà-ÿ])(?!\s+savoir)", re.I)
POLITE = re.compile(r"^\W*(?:s'il te pla[iî]t\s+)?(?:est-ce que )?(?:tu peux|peux-tu|pourrais-tu|vous pouvez|pouvez-vous)\s+", re.I)


def is_question(text):
    polite = POLITE.match(text)
    if polite:
        # "Peux-tu me dire qui est Rose ?" is a question; "Peux-tu ajouter un déjeuner ?" is an order.
        rest = re.sub(r"^(?:me |nous )", "", text[polite.end():])
        return bool(ASKING.match(rest)) or bool(re.match(r"(?:dire|lire|rappeler|montrer)\b", rest))
    if WISH.match(text):
        return False
    return text.rstrip().endswith("?") or bool(ASKING.match(text))
