export const animeData = [
  {
    id: 'frieren',
    title: 'Frieren: Beyond Journey\'s End',
    originalTitle: '葬送のフリーレン',
    description: 'Petualangan elf penyihir Frieren setelah kelompok pahlawan mengalahkan Raja Iblis.',
    tags: ['Fantasy', 'Adventure', 'Drama'],
    status: 'COMPLETED',
    rating: 4.9,
    badge: 'TOP 10',
    posterUrl: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
    episodes: [
      { id: 'ep1', title: 'Episode 1', subtitle: 'Perjalanan Berakhir', videoId: 'vrMTnVo_Lf4', duration: '24:00' },
      { id: 'ep2', title: 'Episode 2', subtitle: 'Sihir Sehari-hari', videoId: 'vrMTnVo_Lf4', duration: '24:00' }
    ]
  },
  {
    id: 'tensura-s3',
    title: 'Tensei Shitara Slime Datta Ken S3',
    originalTitle: '転生したらスライムだった件',
    description: 'Kisah Rimuru Tempest membangun bangsa monster yang damai dan kuat.',
    tags: ['Isekai', 'Fantasy', 'Action'],
    status: 'ONGOING',
    rating: 4.8,
    badge: 'NEW',
    posterUrl: 'https://cdn.myanimelist.net/images/anime/1211/143476l.jpg',
    episodes: [
      { id: 'ep1', title: 'Episode 49', subtitle: 'Iblis dan Rencana', videoId: 'kYc-r94yV6s', duration: '24:00' },
      { id: 'ep2', title: 'Episode 50', subtitle: 'Pertemuan Suci', videoId: 'kYc-r94yV6s', duration: '24:00' }
    ]
  },
  {
    id: 'demon-slayer-s4',
    title: 'Demon Slayer: Hashira Training Arc',
    originalTitle: '鬼滅の刃',
    description: 'Tanjiro dan kawan-kawan berlatih keras di bawah bimbingan para Hashira.',
    tags: ['Action', 'Supernatural', 'Shounen'],
    status: 'ONGOING',
    rating: 4.9,
    badge: 'NEW',
    posterUrl: 'https://cdn.myanimelist.net/images/anime/1565/142711l.jpg',
    episodes: [
      { id: 'ep1', title: 'Episode 1', subtitle: 'Untuk Mengalahkan Muzan Kibutsuji', videoId: 'PraFso1sVIc', duration: '48:00' },
      { id: 'ep2', title: 'Episode 2', subtitle: 'Rasa Sakit Tomioka Giyu', videoId: 'PraFso1sVIc', duration: '24:00' }
    ]
  },
  {
    id: 'kaiju-no-8',
    title: 'Kaiju No. 8',
    originalTitle: '怪獣8号',
    description: 'Kafka Hibino yang bercita-cita menjadi Pasukan Pertahanan mendadak berubah menjadi Kaiju.',
    tags: ['Action', 'Sci-Fi', 'Shounen'],
    status: 'ONGOING',
    rating: 4.8,
    badge: 'HOT',
    posterUrl: 'https://cdn.myanimelist.net/images/anime/1370/140362l.jpg',
    episodes: [
      { id: 'ep1', title: 'Episode 1', subtitle: 'Pria yang Menjadi Kaiju', videoId: 'LXb3EKWsInQ', duration: '24:00' },
      { id: 'ep2', title: 'Episode 2', subtitle: 'Kaiju Mengalahkan Kaiju', videoId: 'LXb3EKWsInQ', duration: '24:00' }
    ]
  }
];

export const getAnimeById = (id) => animeData.find(anime => anime.id === id);
