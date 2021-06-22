import Head from 'next/head';
import Image from 'next/image';
import styles from '../styles/Home.module.css';
import Link from 'next/link';

export default function Home() {
  return (
    <div className='container'>
      <Head>
        <title>Creative Bandit</title>
        <meta name='description' content='Creative Bandit | Create your web experience' />
        <link rel='icon' href='/favicon.ico' />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
        CREATIVE
        </h1>
        <h1 className={styles.title}>
        BANDIT
        </h1>

        <div className={styles.grid}>
          <Link href='/portfolio'>
            <button>Design</button>
          </Link>
        </div>
      </main>

      <footer className={styles.footer}>        
        <p>Powered by Creative Bandit ©2021</p>
      </footer>
    </div>
  );
}
