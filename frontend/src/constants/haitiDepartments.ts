export const HAITI_DEPARTMENTS = [
  'Artibonite',
  'Centre',
  'Grand\'Anse',
  'Nippes',
  'Nord',
  'Nord-Est',
  'Nord-Ouest',
  'Ouest',
  'Sud',
  'Sud-Est',
] as const

export const HAITI_CITIES_BY_DEPARTMENT: Record<(typeof HAITI_DEPARTMENTS)[number], string[]> = {
  Artibonite: ['Dessalines', 'Desdunes', 'Ennery', 'Gonaives', 'Gros-Morne', 'L\'Estere', 'Petite-Riviere-de-l\'Artibonite', 'Saint-Marc', 'Verrettes'],
  Centre: ['Belladere', 'Cerca-la-Source', 'Hinche', 'Lascahobas', 'Mirebalais', 'Saut-d\'Eau', 'Savanette', 'Thomassique', 'Thomonde'],
  "Grand'Anse": ['Anse-d\'Hainault', 'Beaumont', 'Chambellan', 'Corail', 'Dame-Marie', 'Jeremie', 'Les Irois', 'Moron', 'Pestel', 'Roseaux'],
  Nippes: ['Anse-a-Veau', 'Arnaud', 'Baraderes', 'L\'Asile', 'Miragoane', 'Paillant', 'Petit-Trou-de-Nippes', 'Plaisance-du-Sud'],
  Nord: ['Acul-du-Nord', 'Borgne', 'Cap-Haitien', 'Dondon', 'Grande-Riviere-du-Nord', 'Limonade', 'Limbé', 'Milot', 'Plaine-du-Nord', 'Plaisance', 'Port-Margot', 'Quartier-Morin'],
  'Nord-Est': ['Caracol', 'Ferrier', 'Fort-Liberte', 'Mont-Organise', 'Ouanaminthe', 'Perches', 'Sainte-Suzanne', 'Terrier-Rouge', 'Trou-du-Nord', 'Vallieres'],
  'Nord-Ouest': ['Anse-Rouge', 'Baie-de-Henne', 'Bombardopolis', 'Chansolme', 'Jean-Rabel', 'La Tortue', 'Mole-Saint-Nicolas', 'Port-de-Paix', 'Saint-Louis-du-Nord'],
  Ouest: ['Arcahaie', 'Carrefour', 'Cite Soleil', 'Croix-des-Bouquets', 'Delmas', 'Ganthier', 'Kenscoff', 'Leogane', 'Petion-Ville', 'Port-au-Prince', 'Tabarre', 'Thomazeau'],
  Sud: ['Aquin', 'Camp-Perrin', 'Cayes', 'Chantal', 'Coteaux', 'Les Anglais', 'Port-Salut', 'Saint-Jean-du-Sud', 'Torbeck'],
  'Sud-Est': ['Bainet', 'Belle-Anse', 'Cotes-de-Fer', 'Grand-Gosier', 'Jacmel', 'La Vallee-de-Jacmel', 'Marigot', 'Thiotte'],
}