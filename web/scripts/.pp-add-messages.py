import json
EN = {
  "rail": {"label": "Projects", "collect": "Collect", "projects": "Projects", "receipts": "Receipts"},
  "title": "Projects",
  "intro": "Find the client or project, see what is owed and where the figure comes from, and collect it.",
  "search": {
    "label": "Client or project",
    "placeholder": "Type a client or project name",
    "empty": "Nothing matches that name.",
    "none": "No commissioned projects yet. A project appears here when a client accepts an offer on a conversation.",
    "unavailable": "We could not load the projects. Nothing was changed. Try again in a moment.",
    "count": "{count} shown, money owed first"
  },
  "list": {
    "colProject": "Project", "colClient": "Client", "colOwed": "Owed", "colNext": "Next",
    "open": "Open", "caption": "Every commissioned project in this workspace, the ones with money owed first."
  },
  "detail": {
    "back": "All projects", "client": "Client", "noClient": "No client recorded", "noDate": "No date set",
    "starts": "Starts", "openWorkspace": "Open the full project in the workspace", "nextTitle": "Next"
  },
  "money": {
    "due": "Still owed by the client", "collected": "Collected", "agreed": "Agreed with the client",
    "agreedNone": "No version has been accepted yet, so there is no agreed price.",
    "rowsTitle": "Where the figure comes from",
    "colRecord": "Record", "colStatus": "Status", "colTotal": "Total", "colCollected": "Collected",
    "colOutstanding": "Outstanding", "colReceipt": "Receipt", "noReceipt": "No receipt yet",
    "noOrders": "No order is attached to this project, so nothing is tracked as owed.",
    "collectingAgainst": "A collection here goes against record {id}.",
    "notCounted": "Not counted: this record is not awaiting payment."
  },
  "collect": {
    "title": "Collect a balance", "whole": "The whole balance", "deposit": "A deposit",
    "depositLabel": "Deposit amount",
    "depositHint": "Less than what is outstanding. The rest stays owed on the same record.",
    "open": "Collect {amount}", "back": "Back to the project",
    "amount": {
      "not_a_number": "Type the deposit as a number, like 150 or 150.50.",
      "zero": "A deposit has to be more than zero.",
      "over_balance": "That is more than what is outstanding. Collect the whole balance instead."
    }
  },
  "refusal": {
    "project_closed": "This project is closed. Nothing can be collected on it.",
    "agreement_awaiting": "Collect is not offered while a version of the agreement is waiting on the client. Nothing is collected under terms they have not agreed to.",
    "milestone_awaiting": "Collect is not offered while a deliverable is waiting on the client. They are being asked to pay for work they have not been shown.",
    "nothing_owed": "Nothing is owed on this project. Every attached record is settled, cancelled or not yet due.",
    "mixed_currency": "The records on this project are in more than one currency, so they cannot be collected as one balance.",
    "project_gone": "That project is no longer here. Reload to see the current list.",
    "order_changed": "What is owed changed while this screen was open. Reload to see the balance as it stands now."
  },
  "paid": {
    "title": "Collected", "remaining": "Still owed after this", "settled": "This record is now settled.",
    "noReceipt": "The money was recorded, but no receipt code could be issued. Open the project to try again.",
    "back": "Back to the project"
  },
  "receipts": {
    "title": "Receipts", "intro": "Find a receipt by the code printed on it.",
    "codeLabel": "Receipt code", "placeholder": "Paste or type the code", "find": "Find the receipt",
    "open": "Open the receipt", "record": "Record", "status": "Status", "total": "Total",
    "collected": "Collected", "issued": "Issued", "onProject": "Receipts on this project",
    "refusal": {
      "invalid_code": "That is not a receipt code. A code is at least 16 letters and digits.",
      "not_found": "No receipt in this workspace carries that code.",
      "unavailable": "We could not look that up. Nothing was changed. Try again in a moment.",
      "not_allowed": "You are not allowed to look up receipts here."
    }
  }
}
ES = {
  "rail": {"label": "Proyectos", "collect": "Cobrar", "projects": "Proyectos", "receipts": "Recibos"},
  "title": "Proyectos",
  "intro": "Busca el cliente o el proyecto, mira lo que se debe y de dónde sale la cifra, y cóbralo.",
  "search": {
    "label": "Cliente o proyecto",
    "placeholder": "Escribe el nombre de un cliente o proyecto",
    "empty": "Nada coincide con ese nombre.",
    "none": "Todavía no hay proyectos. Un proyecto aparece aquí cuando un cliente acepta una oferta en una conversación.",
    "unavailable": "No pudimos cargar los proyectos. No se cambió nada. Inténtalo de nuevo en un momento.",
    "count": "{count} en pantalla, primero los que deben dinero"
  },
  "list": {
    "colProject": "Proyecto", "colClient": "Cliente", "colOwed": "Debe", "colNext": "Siguiente",
    "open": "Abrir", "caption": "Todos los proyectos de este espacio, primero los que deben dinero."
  },
  "detail": {
    "back": "Todos los proyectos", "client": "Cliente", "noClient": "Sin cliente registrado", "noDate": "Sin fecha",
    "starts": "Empieza", "openWorkspace": "Abrir el proyecto completo en el espacio de trabajo", "nextTitle": "Siguiente"
  },
  "money": {
    "due": "Pendiente del cliente", "collected": "Cobrado", "agreed": "Acordado con el cliente",
    "agreedNone": "Ninguna versión ha sido aceptada, así que no hay precio acordado.",
    "rowsTitle": "De dónde sale la cifra",
    "colRecord": "Registro", "colStatus": "Estado", "colTotal": "Total", "colCollected": "Cobrado",
    "colOutstanding": "Pendiente", "colReceipt": "Recibo", "noReceipt": "Sin recibo todavía",
    "noOrders": "No hay ningún pedido vinculado a este proyecto, así que nada consta como pendiente.",
    "collectingAgainst": "Un cobro aquí se aplica al registro {id}.",
    "notCounted": "No cuenta: este registro no está pendiente de pago."
  },
  "collect": {
    "title": "Cobrar un saldo", "whole": "Todo el saldo", "deposit": "Un anticipo",
    "depositLabel": "Importe del anticipo",
    "depositHint": "Menor que lo pendiente. El resto sigue pendiente en el mismo registro.",
    "open": "Cobrar {amount}", "back": "Volver al proyecto",
    "amount": {
      "not_a_number": "Escribe el anticipo como un número, por ejemplo 150 o 150.50.",
      "zero": "Un anticipo tiene que ser mayor que cero.",
      "over_balance": "Es más de lo pendiente. Cobra todo el saldo en su lugar."
    }
  },
  "refusal": {
    "project_closed": "Este proyecto está cerrado. No se puede cobrar nada.",
    "agreement_awaiting": "No se ofrece cobrar mientras una versión del acuerdo espera la respuesta del cliente. No se cobra bajo condiciones que no ha aceptado.",
    "milestone_awaiting": "No se ofrece cobrar mientras un entregable espera la revisión del cliente. Se le estaría pidiendo pagar por un trabajo que no ha visto.",
    "nothing_owed": "No se debe nada en este proyecto. Cada registro vinculado está saldado, cancelado o aún no vence.",
    "mixed_currency": "Los registros de este proyecto están en más de una moneda, así que no se pueden cobrar como un solo saldo.",
    "project_gone": "Ese proyecto ya no está aquí. Recarga para ver la lista actual.",
    "order_changed": "Lo pendiente cambió mientras esta pantalla estaba abierta. Recarga para ver el saldo actual."
  },
  "paid": {
    "title": "Cobrado", "remaining": "Pendiente después de esto", "settled": "Este registro queda saldado.",
    "noReceipt": "El dinero quedó registrado, pero no se pudo emitir un código de recibo. Abre el proyecto para intentarlo de nuevo.",
    "back": "Volver al proyecto"
  },
  "receipts": {
    "title": "Recibos", "intro": "Busca un recibo por el código impreso en él.",
    "codeLabel": "Código del recibo", "placeholder": "Pega o escribe el código", "find": "Buscar el recibo",
    "open": "Abrir el recibo", "record": "Registro", "status": "Estado", "total": "Total",
    "collected": "Cobrado", "issued": "Emitido", "onProject": "Recibos de este proyecto",
    "refusal": {
      "invalid_code": "Eso no es un código de recibo. Un código tiene al menos 16 letras y dígitos.",
      "not_found": "Ningún recibo de este espacio lleva ese código.",
      "unavailable": "No pudimos consultarlo. No se cambió nada. Inténtalo de nuevo en un momento.",
      "not_allowed": "No tienes permiso para consultar recibos aquí."
    }
  }
}
FR = {
  "rail": {"label": "Projets", "collect": "Encaisser", "projects": "Projets", "receipts": "Reçus"},
  "title": "Projets",
  "intro": "Trouvez le client ou le projet, voyez ce qui est dû et d'où vient le montant, puis encaissez-le.",
  "search": {
    "label": "Client ou projet",
    "placeholder": "Saisissez le nom d'un client ou d'un projet",
    "empty": "Rien ne correspond à ce nom.",
    "none": "Aucun projet pour l'instant. Un projet apparaît ici quand un client accepte une offre dans une conversation.",
    "unavailable": "Impossible de charger les projets. Rien n'a été modifié. Réessayez dans un instant.",
    "count": "{count} affichés, ceux qui doivent de l'argent d'abord"
  },
  "list": {
    "colProject": "Projet", "colClient": "Client", "colOwed": "Dû", "colNext": "Suite",
    "open": "Ouvrir", "caption": "Tous les projets de cet espace, ceux qui doivent de l'argent d'abord."
  },
  "detail": {
    "back": "Tous les projets", "client": "Client", "noClient": "Aucun client enregistré", "noDate": "Pas de date",
    "starts": "Début", "openWorkspace": "Ouvrir le projet complet dans l'espace de travail", "nextTitle": "Suite"
  },
  "money": {
    "due": "Encore dû par le client", "collected": "Encaissé", "agreed": "Convenu avec le client",
    "agreedNone": "Aucune version n'a été acceptée, il n'y a donc pas de prix convenu.",
    "rowsTitle": "D'où vient le montant",
    "colRecord": "Enregistrement", "colStatus": "Statut", "colTotal": "Total", "colCollected": "Encaissé",
    "colOutstanding": "Restant", "colReceipt": "Reçu", "noReceipt": "Pas encore de reçu",
    "noOrders": "Aucune commande n'est rattachée à ce projet, rien n'est donc suivi comme dû.",
    "collectingAgainst": "Un encaissement ici s'applique à l'enregistrement {id}.",
    "notCounted": "Non compté : cet enregistrement n'est pas en attente de paiement."
  },
  "collect": {
    "title": "Encaisser un solde", "whole": "Tout le solde", "deposit": "Un acompte",
    "depositLabel": "Montant de l'acompte",
    "depositHint": "Inférieur au restant. Le reste demeure dû sur le même enregistrement.",
    "open": "Encaisser {amount}", "back": "Retour au projet",
    "amount": {
      "not_a_number": "Saisissez l'acompte sous forme de nombre, par exemple 150 ou 150.50.",
      "zero": "Un acompte doit être supérieur à zéro.",
      "over_balance": "C'est plus que le restant. Encaissez plutôt tout le solde."
    }
  },
  "refusal": {
    "project_closed": "Ce projet est clos. Rien ne peut être encaissé.",
    "agreement_awaiting": "L'encaissement n'est pas proposé tant qu'une version de l'accord attend la réponse du client. Rien n'est encaissé selon des conditions qu'il n'a pas acceptées.",
    "milestone_awaiting": "L'encaissement n'est pas proposé tant qu'un livrable attend la validation du client. On lui demanderait de payer un travail qu'il n'a pas vu.",
    "nothing_owed": "Rien n'est dû sur ce projet. Chaque enregistrement rattaché est réglé, annulé ou pas encore exigible.",
    "mixed_currency": "Les enregistrements de ce projet sont dans plusieurs devises, ils ne peuvent donc pas être encaissés comme un seul solde.",
    "project_gone": "Ce projet n'est plus là. Rechargez pour voir la liste actuelle.",
    "order_changed": "Le montant dû a changé pendant que cet écran était ouvert. Rechargez pour voir le solde actuel."
  },
  "paid": {
    "title": "Encaissé", "remaining": "Encore dû après cela", "settled": "Cet enregistrement est maintenant réglé.",
    "noReceipt": "L'argent a été enregistré, mais aucun code de reçu n'a pu être émis. Ouvrez le projet pour réessayer.",
    "back": "Retour au projet"
  },
  "receipts": {
    "title": "Reçus", "intro": "Trouvez un reçu grâce au code imprimé dessus.",
    "codeLabel": "Code du reçu", "placeholder": "Collez ou saisissez le code", "find": "Trouver le reçu",
    "open": "Ouvrir le reçu", "record": "Enregistrement", "status": "Statut", "total": "Total",
    "collected": "Encaissé", "issued": "Émis", "onProject": "Reçus de ce projet",
    "refusal": {
      "invalid_code": "Ce n'est pas un code de reçu. Un code compte au moins 16 lettres et chiffres.",
      "not_found": "Aucun reçu de cet espace ne porte ce code.",
      "unavailable": "Impossible de faire la recherche. Rien n'a été modifié. Réessayez dans un instant.",
      "not_allowed": "Vous n'êtes pas autorisé à consulter les reçus ici."
    }
  }
}
for locale, block in (("en",EN),("es",ES),("fr",FR)):
    p=f"messages/{locale}.json"
    d=json.load(open(p))
    pos=d["dashboard"]["pos"]
    assert "projects" not in pos, locale
    pos["projects"]=block
    open(p,"w").write(json.dumps(d,indent=2,ensure_ascii=False)+"\n")
    print(locale,"ok")
