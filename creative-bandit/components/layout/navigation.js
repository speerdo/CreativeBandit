import Link from 'next/link';
import styles from '../../styles/Navigation.module.css';

export default function Navigation() {
  return (
    <div className={styles.navContainer}>
      <nav className={styles.nav}>
        <ul className={styles.ul}>
          <li className={styles.li}>
            <Link href='/' className={styles.link}>
              Home
            </Link>
          </li>
          <li className={styles.li}>
            <Link href='/portfolio' className={styles.link}>
              Portfolio
            </Link>
          </li>
          <li className={styles.li}>
            <Link href='/' className={styles.link}>
              Resume
            </Link>
          </li>
          <li className={styles.li}>
            <Link href='/' className={styles.link}>
              Contact
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
