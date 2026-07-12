import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

DB_PARAMS = dict(dbname='postgres', user='postgres', password='agromitra123', host='localhost', port=5432)

if __name__ == '__main__':
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM pg_database WHERE datname='agromitra_db'")
        if cur.fetchone():
            print('Database agromitra_db already exists')
        else:
            cur.execute('CREATE DATABASE agromitra_db')
            print('Database agromitra_db created')
        cur.close()
        conn.close()
    except Exception as e:
        print('ERROR:', e)
        raise
