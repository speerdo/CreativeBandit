import Link from 'next/link';
import styles from '../../styles/Navigation.module.css';

export default function Navigation() {
    return (
        <div classList={styles.navContainer}>
            <nav classList={styles.nav}>
                <ul classList={styles.ul}>
                    <li classList={styles.li}><Link href='' classList={styles.link}>Home</Link></li>
                    <li classList={styles.li}><Link href='' classList={styles.link}>Portfolio</Link></li>
                    <li classList={styles.li}><Link href='' classList={styles.link}>Resume</Link></li>
                    <li classList={styles.li}><Link href='' classList={styles.link}>Contact</Link></li>
                </ul>
            </nav>
        </div>
    ); 
}