import Shell from "../components/Shell";

const sections = [
  {
    title: "1. Penerimaan Ketentuan",
    body: "Dengan mengakses dan menggunakan layanan MahiStream (\"Aplikasi\"), Anda menyetujui untuk terikat oleh Syarat dan Ketentuan ini. Jika Anda tidak menyetujui sebagian atau seluruh ketentuan ini, Anda tidak diperkenankan menggunakan Aplikasi."
  },
  {
    title: "2. Definisi",
    body: "MahiStream adalah platform agregator yang menyediakan akses ke konten anime melalui tautan dari layanan pihak ketiga. Aplikasi tidak menyimpan, menghosting, atau mendistribusikan file video apa pun di servernya sendiri. Seluruh konten video ditayangkan melalui layanan pihak ketiga yang terpisah."
  },
  {
    title: "3. Hak Kekayaan Intelektual",
    body: "Seluruh merek dagang, logo, nama layanan, dan konten visual yang ditampilkan dalam Aplikasi adalah milik dari pemiliknya masing-masing. MahiStream tidak mengklaim kepemilikan atas konten anime, karakter, atau materi terkait lainnya yang tersedia melalui tautan pihak ketiga. Aplikasi hanya bertindak sebagai perantara navigasi."
  },
  {
    title: "4. Penggunaan Layanan",
    body: "Anda setuju untuk menggunakan Aplikasi hanya untuk tujuan menonton pribadi dan non-komersial. Anda dilarang keras untuk: menyalin, memodifikasi, mendistribusikan, menjual, atau mengeksploitasi konten Aplikasi tanpa izin tertulis; melakukan rekayasa balik, dekompilasi, atau upaya ekstraksi kode sumber; menggunakan robot, scraper, atau alat otomatis lainnya untuk mengakses Aplikasi; mengganggu atau membebani infrastruktur Aplikasi secara berlebihan."
  },
  {
    title: "5. Akun dan Keamanan",
    body: "Pembuatan akun dilakukan melalui layanan Google Sign-In. Anda bertanggung jawab penuh atas keamanan akun Google Anda dan semua aktivitas yang terjadi di bawah akun Anda. Aplikasi berhak menangguhkan atau mengakhiri akun yang melanggar ketentuan ini, termasuk namun tidak terbatas pada penyalahgunaan fitur, pelanggaran hak cipta, atau aktivitas mencurigakan lainnya."
  },
  {
    title: "6. Konten Pihak Ketiga",
    body: "Aplikasi menyediakan tautan ke layanan pihak ketiga seperti Google Drive, Telegram, dan platform lainnya. MahiStream tidak memiliki kendali atas konten, kebijakan privasi, atau praktik dari pihak ketiga tersebut. Anda mengakui bahwa MahiStream tidak bertanggung jawab atas ketersediaan, kualitas, atau legalitas konten yang disediakan oleh pihak ketiga. Segala keluhan terkait hak cipta harus ditujukan kepada pemilik konten asli."
  },
  {
    title: "7. Batasan Tanggung Jawab",
    body: "MahiStream disediakan \"sebagaimana adanya\" (as-is) tanpa jaminan apa pun, baik tersurat maupun tersirat. Aplikasi tidak menjamin bahwa layanan akan berjalan tanpa gangguan, bebas dari kesalahan, atau aman dari serangan pihak ketiga. Dalam keadaan apa pun, pengembang dan pengelola Aplikasi tidak bertanggung jawab atas kerusakan langsung, tidak langsung, insidental, konsekuensial, atau hukuman yang timbul dari penggunaan atau ketidakmampuan menggunakan Aplikasi."
  },
  {
    title: "8. Kebijakan Privasi",
    body: "Data yang dikumpulkan oleh Aplikasi terbatas pada informasi akun dasar (alamat email dan nama yang diberikan melalui Google Sign-In), riwayat tontonan, preferensi pengguna, dan data bookmark. Data ini digunakan semata-mata untuk meningkatkan pengalaman pengguna dan tidak akan dijual atau dibagikan kepada pihak ketiga tanpa persetujuan Anda, kecuali diwajibkan oleh hukum. Riwayat tontonan dan data preferensi dapat dihapus kapan saja melalui pengaturan akun."
  },
  {
    title: "9. Tautan Eksternal",
    body: "Aplikasi dapat berisi tautan ke situs web atau layanan eksternal yang tidak dioperasikan oleh MahiStream. Kami tidak bertanggung jawab atas isi, produk, atau layanan dari situs eksternal tersebut. Penggunaan situs eksternal sepenuhnya merupakan tanggung jawab dan risiko Anda sendiri."
  },
  {
    title: "10. Perubahan Ketentuan",
    body: "Pengelola Aplikasi berhak untuk memperbarui, mengubah, atau mengganti Syarat dan Ketentuan ini kapan saja tanpa pemberitahuan sebelumnya. Perubahan akan berlaku segera setelah dipublikasikan di dalam Aplikasi. Penggunaan berkelanjutan Anda terhadap Aplikasi setelah perubahan tersebut dianggap sebagai penerimaan Anda terhadap ketentuan yang telah diperbarui. Disarankan untuk meninjau halaman ini secara berkala."
  },
  {
    title: "11. Hukum yang Berlaku",
    body: "Syarat dan Ketentuan ini diatur oleh dan ditafsirkan sesuai dengan hukum Republik Indonesia. Setiap perselisihan yang timbul dari atau berkaitan dengan ketentuan ini akan diselesaikan melalui musyawarah terlebih dahulu, dan jika tidak tercapai kesepakatan, akan diselesaikan di pengadilan yang berwenang di wilayah hukum Republik Indonesia."
  },
  {
    title: "12. Kontak",
    body: "Jika Anda memiliki pertanyaan, saran, atau keluhan mengenai Syarat dan Ketentuan ini, silakan hubungi kami melalui menu Pengaturan atau halaman Bantuan yang tersedia di dalam Aplikasi. Kami akan berusaha menanggapi dalam waktu 3x24 jam."
  }
];

export default function Terms() {
  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Syarat & Ketentuan</h1>
          <p className="mt-1 text-sm text-muted">Terakhir diperbarui: 22 Juli 2026</p>
        </div>
        <div className="space-y-6">
          {sections.map((s, i) => (
            <section key={i}>
              <h2 className="mb-2 text-sm font-bold text-ink">{s.title}</h2>
              <p className="text-sm leading-relaxed text-muted">{s.body}</p>
            </section>
          ))}
        </div>
        <div className="mt-10 border-t border-line pt-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted2">
            MahiStream v2.1.0
          </p>
        </div>
      </div>
    </Shell>
  );
}
