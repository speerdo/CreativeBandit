import Header from '../components/layout/header.js';
import Navigation from '../components/layout/navigation.js';
import Image from 'next/image';
import styles from '../styles/Portfolio.module.css';
import Link from 'next/link';

export default function Portfolio() {
  return (
    <div className='container'>
      <Header />
      <Navigation />

      <main className={styles.main}>
        <h1 className={styles.title}>My Portfolio</h1>

        

        <div className={styles.grid}></div>
      </main>

      <footer className='footer'>
        <p>Powered by Creative Bandit ©2021</p>
      </footer>
    </div>
  );
}
