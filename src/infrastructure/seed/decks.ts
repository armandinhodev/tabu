/**
 * Preloaded decks with stable, zero-padded card IDs.
 * Each card owns its six normalized taboo words directly, in display order.
 * IDs and content remain stable so existing discarded-card references are preserved.
 */
export interface SeedCard {
  readonly id: string;
  readonly word: string;
  readonly taboo: readonly string[];
}

export interface SeedDeck {
  readonly name: string;
  readonly category: string;
  readonly cards: readonly SeedCard[];
}

export const SEED_DECKS: readonly SeedDeck[] = [
  {
    name: "General",
    category: "General",
    cards: [
      {
        id: "general-001",
        word: "fuego",
        taboo: ["llama", "chimenea", "brasa", "humo", "quemar", "ceniza"],
      },
      {
        id: "general-002",
        word: "agua",
        taboo: ["rio", "mar", "liquido", "beber", "lluvia", "sed"],
      },
      {
        id: "general-003",
        word: "arbol",
        taboo: ["tronco", "hoja", "bosque", "raiz", "rama", "sombra"],
      },
      {
        id: "general-004",
        word: "montaña",
        taboo: ["cumbre", "sendero", "altura", "pico", "escalar", "nieve"],
      },
      {
        id: "general-005",
        word: "puente",
        taboo: ["viga", "calzada", "charco", "cruzar", "orilla", "rio"],
      },
      {
        id: "general-006",
        word: "reloj",
        taboo: ["manecillas", "arena", "tic", "hora", "tiempo", "aguja"],
      },
      {
        id: "general-007",
        word: "sombra",
        taboo: ["silueta", "penumbra", "oscuridad", "sol", "luz", "proyeccion"],
      },
      {
        id: "general-008",
        word: "espejo",
        taboo: ["reflejo", "cristal", "vanidad", "imagen", "reflejar", "brillo"],
      },
      {
        id: "general-009",
        word: "llave",
        taboo: ["cerradura", "candado", "abrir", "metal", "puerta", "girar"],
      },
      {
        id: "general-010",
        word: "ventana",
        taboo: ["cortina", "vidrio", "marco", "abrir", "persiana", "mirar"],
      },
      {
        id: "general-011",
        word: "puerta",
        taboo: ["manija", "cerrojo", "zaguan", "entrada", "salida", "abrir"],
      },
      {
        id: "general-012",
        word: "cama",
        taboo: ["colchon", "almohada", "descanso", "dormir", "sabana", "noche"],
      },
      {
        id: "general-013",
        word: "mesa",
        taboo: ["servilleta", "cubierto", "silla", "comer", "mueble", "patas"],
      },
      {
        id: "general-014",
        word: "silla",
        taboo: ["respaldo", "asiento", "banqueta", "sentarse", "patas", "mueble"],
      },
      {
        id: "general-015",
        word: "cocina",
        taboo: ["horno", "fogon", "olla", "comida", "preparar", "receta"],
      },
      {
        id: "general-016",
        word: "horno",
        taboo: ["masa", "pan", "fuego", "cocinar", "caliente", "temperatura"],
      },
      {
        id: "general-017",
        word: "pan",
        taboo: ["masa", "harina", "rebanada", "hornear", "miga", "tostada"],
      },
      {
        id: "general-018",
        word: "queso",
        taboo: ["lacteo", "rallado", "quesada", "leche", "vaca", "fundido"],
      },
      {
        id: "general-019",
        word: "leche",
        taboo: ["lacteo", "botella", "desayuno", "vaca", "blanco", "vaso"],
      },
      {
        id: "general-020",
        word: "huevo",
        taboo: ["gallina", "yema", "cascaron", "clara", "freir", "revuelto"],
      },
      {
        id: "general-021",
        word: "manzana",
        taboo: ["manzano", "corazon", "fruta", "roja", "morder", "semilla"],
      },
      {
        id: "general-022",
        word: "naranja",
        taboo: ["agrio", "gajo", "citrico", "jugo", "exprimir", "fruta"],
      },
      {
        id: "general-023",
        word: "uva",
        taboo: ["racimo", "vina", "moscatel", "vino", "fruta", "semilla"],
      },
      {
        id: "general-024",
        word: "fresa",
        taboo: ["baya", "planta", "crema", "roja", "fruta", "semilla"],
      },
      {
        id: "general-025",
        word: "platano",
        taboo: ["manojo", "pelar", "amarillo", "banana", "fruta", "cascara"],
      },
      {
        id: "general-026",
        word: "zanahoria",
        taboo: ["conejo", "bronceado", "gajo", "naranja", "raiz", "verdura"],
      },
      {
        id: "general-027",
        word: "tomate",
        taboo: ["salsa", "ensalada", "rojo", "fruta", "semilla", "ketchup"],
      },
      {
        id: "general-028",
        word: "pizza",
        taboo: ["masa", "queso", "horno", "porcion", "pizzeria", "tomate"],
      },
      {
        id: "general-029",
        word: "hamburguesa",
        taboo: ["pan", "carne", "comida", "medallon", "lechuga", "sandwich"],
      },
      {
        id: "general-030",
        word: "empanada",
        taboo: ["masa", "relleno", "horno", "repulgue", "carne", "frita"],
      },
      {
        id: "general-031",
        word: "pastel",
        taboo: ["vela", "torta", "dulce", "cumpleanos", "bizcocho", "postre"],
      },
      {
        id: "general-032",
        word: "galleta",
        taboo: ["chocolate", "horno", "duro", "masa", "dulce", "merienda"],
      },
      {
        id: "general-033",
        word: "helado",
        taboo: ["cono", "sorbete", "frio", "postre", "crema", "congelado"],
      },
      {
        id: "general-034",
        word: "chocolate",
        taboo: ["cacao", "dulce", "tableta", "bombon", "negro", "derretir"],
      },
      {
        id: "general-035",
        word: "cafe",
        taboo: ["taza", "grano", "moka", "bebida", "caliente", "despertar"],
      },
      {
        id: "general-036",
        word: "te",
        taboo: ["infusion", "taza", "manzanilla", "saquito", "agua", "hierbas"],
      },
      {
        id: "general-037",
        word: "vino",
        taboo: ["copa", "barril", "uva", "bebida", "bodega", "tinto"],
      },
      {
        id: "general-038",
        word: "cerveza",
        taboo: ["botella", "burbuja", "jarra", "espuma", "lupulo", "bebida"],
      },
      {
        id: "general-039",
        word: "agua mineral",
        taboo: ["gaseosa", "soda", "botella", "gas", "beber", "burbuja"],
      },
      {
        id: "general-040",
        word: "cuchara",
        taboo: ["cocina", "plato", "sopa", "cubierto", "metal", "revolver"],
      },
      {
        id: "general-041",
        word: "tenedor",
        taboo: ["cubierto", "plato", "comer", "dientes", "pinchar", "metal"],
      },
      {
        id: "general-042",
        word: "cuchillo",
        taboo: ["madera", "cocina", "cortar", "filo", "hoja", "cubierto"],
      },
      {
        id: "general-043",
        word: "plato",
        taboo: ["cubierto", "servilleta", "comida", "comer", "vajilla", "redondo"],
      },
      {
        id: "general-044",
        word: "vaso",
        taboo: ["agua", "copa", "beber", "recipiente", "vidrio", "liquido"],
      },
      {
        id: "general-045",
        word: "servilleta",
        taboo: ["papel", "plato", "mesa", "limpiar", "boca", "doblar"],
      },
      {
        id: "general-046",
        word: "sarten",
        taboo: ["cocina", "fuego", "freir", "aceite", "mango", "plancha"],
      },
      {
        id: "general-047",
        word: "microondas",
        taboo: ["horno", "electrico", "comida", "calentar", "ondas", "minutos"],
      },
      {
        id: "general-048",
        word: "heladera",
        taboo: ["nevera", "frio", "puerta", "comida", "conservar", "congelador"],
      },
      {
        id: "general-049",
        word: "lavarropas",
        taboo: ["tambor", "cesto", "electrico", "ropa", "lavar", "jabon"],
      },
      {
        id: "general-050",
        word: "ventilador",
        taboo: ["aire", "viento", "verano", "aspas", "girar", "motor"],
      },
      {
        id: "general-051",
        word: "aire acondicionado",
        taboo: ["frio", "ventilador", "calor", "climatizar", "temperatura", "control remoto"],
      },
      {
        id: "general-052",
        word: "calefactor",
        taboo: ["calor", "invierno", "electrico", "estufa", "temperatura", "hogar"],
      },
      {
        id: "general-053",
        word: "telefono",
        taboo: ["llamada", "pantalla", "cargar", "hablar", "numero", "auricular"],
      },
      {
        id: "general-054",
        word: "computadora",
        taboo: ["pantalla", "teclado", "internet", "procesador", "archivo", "raton"],
      },
      {
        id: "general-055",
        word: "teclado",
        taboo: ["letras", "pulsar", "computadora", "escribir", "botones", "dedos"],
      },
      {
        id: "general-056",
        word: "mouse",
        taboo: ["boton", "clic", "raton", "cursor", "mano", "computadora"],
      },
      {
        id: "general-057",
        word: "pantalla",
        taboo: ["monitor", "tv", "brillo", "imagen", "pixeles", "ver"],
      },
      {
        id: "general-058",
        word: "television",
        taboo: ["programa", "canal", "aparato", "control remoto", "pantalla", "series"],
      },
      {
        id: "general-059",
        word: "control remoto",
        taboo: ["pulsar", "television", "boton", "canal", "pilas", "distancia"],
      },
      {
        id: "general-060",
        word: "camara de fotos",
        taboo: ["lente", "disparo", "obturador", "imagen", "fotografia", "flash"],
      },
      {
        id: "general-061",
        word: "celular",
        taboo: ["telefono", "bateria", "pantalla", "movil", "mensaje", "aplicacion"],
      },
      {
        id: "general-062",
        word: "bateria",
        taboo: ["celular", "carga", "pila", "energia", "recargar", "duracion"],
      },
      {
        id: "general-063",
        word: "auriculares",
        taboo: ["sonido", "musica", "bluetooth", "oreja", "escuchar", "cable"],
      },
      {
        id: "general-064",
        word: "parlante",
        taboo: ["audio", "musica", "sonido", "altavoz", "volumen", "escuchar"],
      },
      {
        id: "general-065",
        word: "musica",
        taboo: ["cancion", "instrumento", "bailar", "sonido", "melodia", "escuchar"],
      },
      {
        id: "general-066",
        word: "guitarra",
        taboo: ["cuerdas", "acorde", "tocar", "instrumento", "rasguear", "madera"],
      },
      {
        id: "general-067",
        word: "piano",
        taboo: ["tecla", "acorde", "tocar", "instrumento", "blanco", "negro"],
      },
      {
        id: "general-068",
        word: "tambor",
        taboo: ["ritmo", "percusion", "golpe", "baqueta", "instrumento", "sonido"],
      },
      {
        id: "general-069",
        word: "microfono",
        taboo: ["amplificador", "gritar", "voz", "cantar", "escenario", "cable"],
      },
      {
        id: "general-070",
        word: "radio",
        taboo: ["frecuencia", "emisor", "antena", "escuchar", "estacion", "musica"],
      },
      {
        id: "general-071",
        word: "notebook",
        taboo: ["pilas", "carpeta", "archivo", "portatil", "pantalla", "teclado"],
      },
      {
        id: "general-072",
        word: "impresora",
        taboo: ["tinta", "papel", "hojas", "documento", "imprimir", "cartucho"],
      },
      {
        id: "general-073",
        word: "sobre",
        taboo: ["carta", "buzon", "postal", "papel", "cerrar", "destinatario"],
      },
      {
        id: "general-074",
        word: "carta",
        taboo: ["sobre", "mensaje", "buzon", "escribir", "papel", "remitente"],
      },
      {
        id: "general-075",
        word: "buzon",
        taboo: ["correos", "entrega", "castillo", "calle", "correo", "ranura"],
      },
      {
        id: "general-076",
        word: "sello",
        taboo: ["estampilla", "buzon", "correos", "tinta", "pegar", "marca"],
      },
      {
        id: "general-077",
        word: "llavero",
        taboo: ["llaves", "bolsillo", "cuadro", "anillo", "metal", "colgar"],
      },
      {
        id: "general-078",
        word: "cartera",
        taboo: ["bolsillo", "dinero", "cuero", "bolso", "guardar", "accesorio"],
      },
      {
        id: "general-079",
        word: "bolsillo",
        taboo: ["cartera", "mano", "campera", "guardar", "ropa", "coser"],
      },
      {
        id: "general-080",
        word: "paraguas",
        taboo: ["lluvia", "gota", "mochila", "abrir", "mojar", "tormenta"],
      },
      {
        id: "general-081",
        word: "gorra",
        taboo: ["cabeza", "sol", "visera", "sombrero", "deporte", "tela"],
      },
      {
        id: "general-082",
        word: "bufanda",
        taboo: ["cuello", "invierno", "abrigo", "lana", "enrollar", "frio"],
      },
      {
        id: "general-083",
        word: "guante",
        taboo: ["mano", "invierno", "abrigo", "dedos", "lana", "vestir"],
      },
      {
        id: "general-084",
        word: "zapatilla",
        taboo: ["pie", "suela", "cordon", "calzado", "correr", "deporte"],
      },
      {
        id: "general-085",
        word: "cordon",
        taboo: ["nudo", "cinta", "zapatilla", "atar", "calzado", "agujero"],
      },
      {
        id: "general-086",
        word: "mochila",
        taboo: ["bolsa", "espalda", "carpeta", "llevar", "tirantes", "escuela"],
      },
      {
        id: "general-087",
        word: "valija",
        taboo: ["maleta", "viaje", "ruedas", "equipaje", "aeropuerto", "guardar"],
      },
      {
        id: "general-088",
        word: "pasaporte",
        taboo: ["vuelo", "viaje", "sello", "documento", "identidad", "frontera"],
      },
      {
        id: "general-089",
        word: "avion",
        taboo: ["piloto", "aeropuerto", "ala", "volar", "cielo", "alas"],
      },
      {
        id: "general-090",
        word: "aeropuerto",
        taboo: ["avion", "equipaje", "terminal", "pista", "despegue", "vuelo"],
      },
      {
        id: "general-091",
        word: "tren",
        taboo: ["vagon", "via", "anden", "ferrocarril", "riel", "locomotora"],
      },
      {
        id: "general-092",
        word: "estacion",
        taboo: ["tren", "anden", "via", "parada", "esperar", "pasajero"],
      },
      {
        id: "general-093",
        word: "taxi",
        taboo: ["auto", "chofer", "viaje", "taximetro", "amarillo", "pasajero"],
      },
      {
        id: "general-094",
        word: "auto",
        taboo: ["volante", "motor", "carretera", "vehiculo", "rueda", "conducir"],
      },
      {
        id: "general-095",
        word: "bicicleta",
        taboo: ["pedal", "manillar", "cadena", "rueda", "casco", "manubrio"],
      },
      {
        id: "general-096",
        word: "gafas",
        taboo: ["lente", "armazon", "vista", "anteojos", "cristal", "ver"],
      },
      {
        id: "general-097",
        word: "camisa",
        taboo: ["manga", "cuello", "boton", "ropa", "abotonar", "tela"],
      },
      {
        id: "general-098",
        word: "pantalon",
        taboo: ["cinturon", "perna", "bolsillo", "pierna", "ropa", "vestir"],
      },
      {
        id: "general-099",
        word: "zapato",
        taboo: ["pie", "suela", "cordon", "calzado", "caminar", "cuero"],
      },
      {
        id: "general-100",
        word: "calcetin",
        taboo: ["lana", "pie", "zapato", "media", "vestir", "tobillo"],
      },
      {
        id: "general-101",
        word: "ropa",
        taboo: ["tela", "lavar", "placer", "armario", "vestirse", "prenda"],
      },
      {
        id: "general-102",
        word: "abrigo",
        taboo: ["invierno", "frio", "gabardina", "chaqueta", "vestir", "caliente"],
      },
      {
        id: "general-103",
        word: "buzo",
        taboo: ["capucha", "sudadera", "vestimenta", "prenda", "abrigo", "algodon"],
      },
      {
        id: "general-104",
        word: "sal",
        taboo: ["salero", "pimienta", "sazon", "condimento", "blanco", "comida"],
      },
      {
        id: "general-105",
        word: "pimienta",
        taboo: ["sal", "molino", "sabor", "especia", "negro", "condimento"],
      },
      {
        id: "general-106",
        word: "azucar",
        taboo: ["dulce", "bolsa", "cafe", "endulzar", "blanco", "cucharada"],
      },
      {
        id: "general-107",
        word: "harina",
        taboo: ["masa", "pan", "colador", "trigo", "polvo", "reposteria"],
      },
      {
        id: "general-108",
        word: "miel",
        taboo: ["abeja", "panqueque", "dulce", "abejas", "panal", "viscoso"],
      },
      {
        id: "general-109",
        word: "galleta de avena",
        taboo: ["chip", "horno", "bolsa", "avena", "dulce", "merienda"],
      },
      {
        id: "general-110",
        word: "atun",
        taboo: ["lata", "mayonesa", "mar", "pescado", "marino", "conserva"],
      },
      {
        id: "general-111",
        word: "mayonesa",
        taboo: ["crema", "sandwich", "huevo", "salsa", "aceite", "aderezo"],
      },
      {
        id: "general-112",
        word: "sandwich",
        taboo: ["pan", "queso", "jugo", "relleno", "fiambre", "comer"],
      },
      {
        id: "general-113",
        word: "ensalada",
        taboo: ["lechuga", "tomate", "plato", "verduras", "mezclar", "comer"],
      },
      {
        id: "general-114",
        word: "verdura",
        taboo: ["lechuga", "zanahoria", "plato", "vegetal", "huerta", "comer"],
      },
      {
        id: "general-115",
        word: "durazno",
        taboo: ["pelado", "canasta", "caramelo", "fruta", "carozo", "jugoso"],
      },
      {
        id: "general-116",
        word: "sandia",
        taboo: ["verano", "semilla", "rebanada", "fruta", "roja", "verde"],
      },
      {
        id: "general-117",
        word: "limon",
        taboo: ["acido", "jugo", "torta", "citrico", "amarillo", "exprimir"],
      },
      {
        id: "general-118",
        word: "tostadora",
        taboo: ["pan", "mantequilla", "rancho", "tostar", "electrico", "desayuno"],
      },
      {
        id: "general-119",
        word: "molinillo",
        taboo: ["cafe", "tuerca", "giro", "moler", "grano", "polvo"],
      },
      {
        id: "general-120",
        word: "balanza",
        taboo: ["bascula", "peso", "gracia", "medir", "kilogramo", "instrumento"],
      },
    ],
  },
  {
    name: "Cine y TV",
    category: "Cine y TV",
    cards: [
      {
        id: "cine-001",
        word: "matrix",
        taboo: ["neo", "pastilla", "agente smith", "codigo", "realidad", "simulacion"],
      },
      {
        id: "cine-002",
        word: "titanic",
        taboo: ["barco", "rosa", "jack", "iceberg", "hundimiento", "oceano"],
      },
      {
        id: "cine-003",
        word: "jurassic park",
        taboo: ["dinosaurio", "trex", "parque", "isla", "fosil", "spielberg"],
      },
      {
        id: "cine-004",
        word: "el rey leon",
        taboo: ["simba", "sabana", "melesa", "mufasa", "disney", "hakuna matata"],
      },
      {
        id: "cine-005",
        word: "toy story",
        taboo: ["woody", "buzz", "juguete", "andy", "vaquero", "pixar"],
      },
      {
        id: "cine-006",
        word: "shrek",
        taboo: ["ogro", "cebolla", "burro", "pantano", "fiona", "verde"],
      },
      {
        id: "cine-007",
        word: "aladdin",
        taboo: ["genio", "lampara", "alfombra", "deseo", "princesa", "agrabah"],
      },
      {
        id: "cine-008",
        word: "pinocho",
        taboo: ["madera", "duende", "nariz", "mentira", "geppetto", "marioneta"],
      },
      {
        id: "cine-009",
        word: "caperucita roja",
        taboo: ["capucha", "lobo", "abuela", "cesta", "cuento", "bosque"],
      },
      {
        id: "cine-010",
        word: "blanca nieve",
        taboo: ["manzana", "enano", "bosque", "espejo", "reina", "cuento"],
      },
      {
        id: "cine-011",
        word: "mision imposible",
        taboo: ["espia", "gafas", "infiltracion", "tom cruise", "agente", "pelicula"],
      },
      {
        id: "cine-012",
        word: "james bond",
        taboo: ["espia", "gadget", "viniaco", "007", "licencia", "martini"],
      },
      {
        id: "cine-013",
        word: "harry potter",
        taboo: ["varita", "mago", "escuela", "hogwarts", "hermione", "escoba"],
      },
      {
        id: "cine-014",
        word: "el senor de los anillos",
        taboo: ["frodo", "sam", "terranova", "anillo", "mordor", "gandalf"],
      },
      {
        id: "cine-015",
        word: "star wars",
        taboo: ["espada", "yoda", "galaxia", "fuerza", "jedi", "darth vader"],
      },
      {
        id: "cine-016",
        word: "star trek",
        taboo: ["nave", "capitan", "espacio", "enterprise", "spock", "vulcano"],
      },
      {
        id: "cine-017",
        word: "batman",
        taboo: ["capucha", "gotham", "justicia", "murcielago", "bruce wayne", "villano"],
      },
      {
        id: "cine-018",
        word: "spiderman",
        taboo: ["arana", "telarana", "mascara", "peter parker", "marvel", "superheroe"],
      },
      {
        id: "cine-019",
        word: "superman",
        taboo: ["capucha", "vuelo", "metropolis", "clark kent", "kripton", "heroe"],
      },
      {
        id: "cine-020",
        word: "iron man",
        taboo: ["armadura", "tony", "escudo", "stark", "metal", "marvel"],
      },
      {
        id: "cine-021",
        word: "vengadores",
        taboo: ["escudo", "batalla", "aliados", "marvel", "superheroes", "equipo"],
      },
      {
        id: "cine-022",
        word: "capitan america",
        taboo: ["escudo", "vibranium", "uniforme", "steve rogers", "marvel", "soldado"],
      },
      {
        id: "cine-023",
        word: "hulk",
        taboo: ["venganza", "gigante", "verde", "bruce banner", "ira", "marvel"],
      },
      {
        id: "cine-024",
        word: "thanos",
        taboo: ["gigante", "guante", "piedra", "infinito", "chasquido", "villano"],
      },
      {
        id: "cine-025",
        word: "doctor strange",
        taboo: ["magia", "capa", "hechicero", "multiverso", "portales", "marvel"],
      },
      {
        id: "cine-026",
        word: "doctor who",
        taboo: ["tardis", "viaje en el tiempo", "galileo", "doctor", "serie", "cabina"],
      },
      {
        id: "cine-027",
        word: "back to the future",
        taboo: [
          "delorean",
          "viaje en el tiempo",
          "auto",
          "marty mcfly",
          "doc brown",
          "ochenta y ocho",
        ],
      },
      {
        id: "cine-028",
        word: "el padrino",
        taboo: ["mafia", "oferta", "familia", "corleone", "cine", "don vito"],
      },
      {
        id: "cine-029",
        word: "pulp fiction",
        taboo: ["director", "maletin", "premio", "tarantino", "travolta", "hamburguesa"],
      },
      {
        id: "cine-030",
        word: "the shining",
        taboo: ["hotel", "llaves", "nieve", "kubrick", "resplandor", "jack torrance"],
      },
      {
        id: "cine-031",
        word: "jaws",
        taboo: ["tiburon", "playa", "barco", "spielberg", "aleta", "miedo"],
      },
      {
        id: "cine-032",
        word: "cazadores de fantasmas",
        taboo: ["ectoplasma", "carro", "sidney", "fantasma", "mochila", "nueva york"],
      },
      {
        id: "cine-033",
        word: "el exorcista",
        taboo: ["demonio", "clerigo", "poseidon", "sacerdote", "posesion", "terror"],
      },
      {
        id: "cine-034",
        word: "it",
        taboo: ["payaso", "miedo", "ninos", "pennywise", "globo", "alcantarilla"],
      },
      {
        id: "cine-035",
        word: "los hunger games",
        taboo: ["arena", "distrito", "juego", "katniss", "tributos", "sinsajo"],
      },
      {
        id: "cine-036",
        word: "dune",
        taboo: ["desierto", "gusano", "arena", "especia", "arrakis", "paul atreides"],
      },
      {
        id: "cine-037",
        word: "interstellar",
        taboo: ["agujero negro", "espacio", "nave", "nolan", "planetas", "gravedad"],
      },
      {
        id: "cine-038",
        word: "gravity",
        taboo: ["espacio", "flotar", "nave", "astronauta", "sandra bullock", "gravedad"],
      },
      {
        id: "cine-039",
        word: "the martian",
        taboo: ["marte", "nave", "suelo", "patata", "astronauta", "supervivencia"],
      },
      {
        id: "cine-040",
        word: "sherlock holmes",
        taboo: ["deduccion", "londres", "detective", "watson", "pipa", "elemental"],
      },
      {
        id: "cine-041",
        word: "murder on the orient express",
        taboo: ["tren", "detective", "misterio", "poirot", "agatha christie", "pasajeros"],
      },
      {
        id: "cine-042",
        word: "saw",
        taboo: ["trampa", "taller", "tuberia", "jigsaw", "horror", "prueba"],
      },
      {
        id: "cine-043",
        word: "resident evil",
        taboo: ["virus", "laboratorio", "zombi", "umbrea", "juego", "milla jovovich"],
      },
      {
        id: "cine-044",
        word: "alien",
        taboo: ["nave", "criatura", "espacio", "ripley", "xenomorfo", "terror"],
      },
      {
        id: "cine-045",
        word: "predator",
        taboo: ["cazador", "selva", "disparo", "extraterrestre", "camuflaje", "alienigena"],
      },
      {
        id: "cine-046",
        word: "terminator",
        taboo: ["robot", "futuro", "arqueologia", "schwarzenegger", "maquina", "cyborg"],
      },
      {
        id: "cine-047",
        word: "willy wonka",
        taboo: ["chocolate", "fabrica", "gominola", "caramelos", "dulces", "charlie"],
      },
      {
        id: "cine-048",
        word: "el precio de la traicion",
        taboo: ["investigacion", "serie", "policia", "traicion", "suspenso", "drama"],
      },
      {
        id: "cine-049",
        word: "better call saul",
        taboo: ["abogado", "corrupcion", "serie", "jimmy mcgill", "criminal", "nuevo mexico"],
      },
      {
        id: "cine-050",
        word: "the office",
        taboo: ["oficina", "jefe", "humor", "michael scott", "empleados", "scranton"],
      },
      {
        id: "cine-051",
        word: "breaking bad",
        taboo: ["cocina", "quimica", "polvo", "walter white", "jesse pinkman", "metanfetamina"],
      },
      {
        id: "cine-052",
        word: "game of thrones",
        taboo: ["trono", "dragon", "trama", "westeros", "familias", "invernalia"],
      },
      {
        id: "cine-053",
        word: "the crown",
        taboo: ["monarquia", "reina", "palacio", "isabel ii", "inglaterra", "corona"],
      },
      {
        id: "cine-054",
        word: "stranger things",
        taboo: ["hawkins", "ninos", "dimension", "eleven", "monstruo", "netflix"],
      },
      {
        id: "cine-055",
        word: "friends",
        taboo: ["cafe", "apartamento", "amigos", "ross", "rachel", "monica"],
      },
      {
        id: "cine-056",
        word: "seinfeld",
        taboo: ["cafe", "comedia", "ciudad", "jerry", "kramer", "nueva york"],
      },
      {
        id: "cine-057",
        word: "los simpson",
        taboo: ["casa", "familia", "dibujo", "homero", "bart", "springfield"],
      },
      {
        id: "cine-058",
        word: "south park",
        taboo: ["pueblo", "satelite", "dibujo", "cartman", "stan", "kenny"],
      },
      {
        id: "cine-059",
        word: "los fugitivos",
        taboo: ["furgoneta", "monjas", "comedia", "fuga", "persecucion", "escapar"],
      },
      {
        id: "cine-060",
        word: "the hangover",
        taboo: ["resaca", "fiesta", "amigos", "las vegas", "boda", "despedida"],
      },
    ],
  },
  {
    name: "Deportes",
    category: "Deportes",
    cards: [
      {
        id: "dep-001",
        word: "futbol",
        taboo: ["pelota", "cancha", "gol", "arco", "jugadores", "deporte"],
      },
      {
        id: "dep-002",
        word: "gol",
        taboo: ["tiro", "red", "portero", "anotar", "marcar", "futbol"],
      },
      {
        id: "dep-003",
        word: "balon",
        taboo: ["red", "portero", "partido", "pelota", "esferico", "futbol"],
      },
      {
        id: "dep-004",
        word: "porteria",
        taboo: ["red", "balon", "arquero", "meta", "poste", "futbol"],
      },
      {
        id: "dep-005",
        word: "arquero",
        taboo: ["manos", "tiro", "balon", "guantes", "atajar", "portero"],
      },
      {
        id: "dep-006",
        word: "pase",
        taboo: ["balon", "companero", "acorde", "asistencia", "jugador", "entregar"],
      },
      {
        id: "dep-007",
        word: "defensa",
        taboo: ["marca", "rival", "ataque", "bloquear", "impedir", "jugador"],
      },
      {
        id: "dep-008",
        word: "ataque",
        taboo: ["delantero", "defensa", "gol", "ofensiva", "presionar", "rivales"],
      },
      {
        id: "dep-009",
        word: "delantero",
        taboo: ["gol", "marca", "equipo", "atacante", "rematar", "jugador"],
      },
      {
        id: "dep-010",
        word: "entrenador",
        taboo: ["banquillo", "estrategia", "equipo", "dirigir", "tactica", "tecnico"],
      },
      {
        id: "dep-011",
        word: "arbitro",
        taboo: ["silbato", "falta", "cancha", "juez", "partido", "reglas"],
      },
      {
        id: "dep-012",
        word: "falta",
        taboo: ["arbitro", "tarjeta", "entrada", "infraccion", "reglas", "sancion"],
      },
      {
        id: "dep-013",
        word: "tarjeta roja",
        taboo: ["arbitro", "expulsion", "falta", "penalizacion", "jugador", "echar"],
      },
      {
        id: "dep-014",
        word: "hincha",
        taboo: ["estadio", "camisa", "grito", "fanatico", "grada", "equipo"],
      },
      {
        id: "dep-015",
        word: "estadio",
        taboo: ["grada", "hincha", "partido", "tribuna", "espectadores", "campo"],
      },
      {
        id: "dep-016",
        word: "grada",
        taboo: ["hincha", "estadio", "cantar", "tribuna", "asientos", "publico"],
      },
      {
        id: "dep-017",
        word: "camisa",
        taboo: ["equipo", "escudo", "hincha", "uniforme", "tela", "vestir"],
      },
      {
        id: "dep-018",
        word: "aficionado",
        taboo: ["hincha", "estadio", "camisa", "fan", "gritar", "apoyar"],
      },
      {
        id: "dep-019",
        word: "basket",
        taboo: ["canasta", "pelota", "triple", "baloncesto", "aro", "jugadores"],
      },
      {
        id: "dep-020",
        word: "canasta",
        taboo: ["aro", "pelota", "cancha", "encestar", "tablero", "puntos"],
      },
      {
        id: "dep-021",
        word: "triple",
        taboo: ["canasta", "distancia", "tiro", "tres", "puntos", "lanzamiento"],
      },
      {
        id: "dep-022",
        word: "rebote",
        taboo: ["pelota", "posicion", "tablero", "saltar", "aro", "capturar"],
      },
      {
        id: "dep-023",
        word: "bote",
        taboo: ["balon", "posicion", "cancha", "picar", "driblar", "pelota"],
      },
      {
        id: "dep-024",
        word: "cuarto",
        taboo: ["cancha", "tiempo", "final", "periodo", "partido", "reloj"],
      },
      {
        id: "dep-025",
        word: "tenis",
        taboo: ["raqueta", "red", "set", "deporte", "partido", "individual"],
      },
      {
        id: "dep-026",
        word: "raqueta",
        taboo: ["cuerda", "tenis", "golpe", "empunadura", "pelota", "deporte"],
      },
      {
        id: "dep-027",
        word: "set",
        taboo: ["punto", "game", "tenis", "manga", "tenista", "marcador"],
      },
      {
        id: "dep-028",
        word: "ace",
        taboo: ["saque", "tenis", "punto", "directo", "servicio", "rival"],
      },
      {
        id: "dep-029",
        word: "saque",
        taboo: ["tenis", "punto", "cancha", "servir", "lanzar", "inicio"],
      },
      {
        id: "dep-030",
        word: "tie break",
        taboo: ["set", "punto", "game", "desempate", "tenis", "marcador"],
      },
      {
        id: "dep-031",
        word: "punto",
        taboo: ["set", "game", "cancha", "marcador", "anotar", "victoria"],
      },
      {
        id: "dep-032",
        word: "game",
        taboo: ["set", "punto", "tenis", "juego", "marcador", "servicio"],
      },
      {
        id: "dep-033",
        word: "volea",
        taboo: ["tenis", "red", "golpe", "aire", "sin bote", "devolver"],
      },
      {
        id: "dep-034",
        word: "ping pong",
        taboo: ["mesa", "pelota", "raqueta", "paleta", "ping", "pong"],
      },
      {
        id: "dep-035",
        word: "tenis de mesa",
        taboo: ["pelotita", "raqueta", "goma", "mesa", "pelota", "deporte"],
      },
      {
        id: "dep-036",
        word: "golf",
        taboo: ["hoyo", "banderin", "campo", "palo", "bola", "deporte"],
      },
      {
        id: "dep-037",
        word: "hoyo",
        taboo: ["golf", "putt", "campo", "agujero", "bandera", "pelota"],
      },
      { id: "dep-038", word: "putt", taboo: ["hoyo", "bola", "golf", "golpe", "corto", "palo"] },
      {
        id: "dep-039",
        word: "green",
        taboo: ["campo", "putt", "golf", "cesped", "bandera", "pelota"],
      },
      {
        id: "dep-040",
        word: "bunkers",
        taboo: ["arena", "fosa", "golf", "trampa", "campo", "pelota"],
      },
      {
        id: "dep-041",
        word: "nado",
        taboo: ["piscina", "clavado", "medalla", "nadar", "agua", "competencia"],
      },
      {
        id: "dep-042",
        word: "piscina",
        taboo: ["nado", "clavado", "carril", "agua", "pileta", "nadar"],
      },
      {
        id: "dep-043",
        word: "clavado",
        taboo: ["piscina", "nado", "salto", "zambullida", "altura", "agua"],
      },
      {
        id: "dep-044",
        word: "medalla",
        taboo: ["nado", "podio", "olimpico", "oro", "plata", "bronce"],
      },
      {
        id: "dep-045",
        word: "carril",
        taboo: ["piscina", "nado", "crono", "andarivel", "competidor", "cuerda"],
      },
      {
        id: "dep-046",
        word: "crono",
        taboo: ["carril", "nado", "record", "cronometro", "segundos", "tiempo"],
      },
      {
        id: "dep-047",
        word: "boxeo",
        taboo: ["guantes", "cuadro", "round", "pelea", "puno", "deporte"],
      },
      {
        id: "dep-048",
        word: "ring",
        taboo: ["boxeo", "cuadro", "guantes", "cuadrilatero", "pelea", "cuerdas"],
      },
      {
        id: "dep-049",
        word: "cuadro",
        taboo: ["round", "ring", "boxeo", "sorteo", "competidores", "eliminatoria"],
      },
      {
        id: "dep-050",
        word: "round",
        taboo: ["cuadro", "combate", "boxeo", "asalto", "campana", "minutos"],
      },
      {
        id: "dep-051",
        word: "combate",
        taboo: ["ring", "guantes", "round", "pelea", "oponente", "victoria"],
      },
      {
        id: "dep-052",
        word: "nocaut",
        taboo: ["puno", "boxeo", "combate", "caida", "cuenta", "boxeador"],
      },
      {
        id: "dep-053",
        word: "lucha libre",
        taboo: ["cinturon", "ring", "titulo", "espectaculo", "combate", "mascara"],
      },
      {
        id: "dep-054",
        word: "cinturon",
        taboo: ["lucha libre", "peso", "titulo", "hebilla", "campeon", "accesorio"],
      },
      {
        id: "dep-055",
        word: "karate",
        taboo: ["kata", "dojo", "cinturon", "artes marciales", "patada", "golpe"],
      },
      {
        id: "dep-056",
        word: "dojo",
        taboo: ["karate", "kata", "entrenador", "practica", "tatami", "maestro"],
      },
      {
        id: "dep-057",
        word: "kata",
        taboo: ["karate", "dojo", "forma", "secuencia", "tecnica", "movimiento"],
      },
      {
        id: "dep-058",
        word: "judo",
        taboo: ["kimono", "ippong", "tatami", "agarre", "derribo", "deporte"],
      },
      {
        id: "dep-059",
        word: "kimono",
        taboo: ["judo", "tatami", "cinturon", "traje", "blanco", "uniforme"],
      },
      {
        id: "dep-060",
        word: "tatami",
        taboo: ["judo", "caida", "colchon", "colchoneta", "piso", "arte marcial"],
      },
    ],
  },
];
