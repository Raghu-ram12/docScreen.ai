import mysql.connector

# Establish the connection
db_connection = mysql.connector.connect(
    host="localhost",        # Your local server
    user="root",    
    password="raghu",
    
    database="college"
)

# Test the connection
def get_table_columns(cursor, table_name):
    """
    Fetch column names for a given table.
    Works for MySQL/MariaDB. For PostgreSQL, swap the query (see note below).
    """
    cursor.execute(f"SHOW COLUMNS FROM {table_name}")
    columns = [row[0] for row in cursor.fetchall()]
    return columns


def insert_dynamic_rows(db_connection):
    cursor = db_connection.cursor()

    table_name = input("Enter table name: ").strip()

    try:
        columns = get_table_columns(cursor, table_name)
    except Exception as e:
        print(f"Could not fetch columns for '{table_name}': {e}")
        cursor.close()
        return

    if not columns:
        print(f"No columns found for table '{table_name}'.")
        cursor.close()
        return

    placeholders = ", ".join(["%s"] * len(columns))
    column_list = ", ".join(columns)
    insert_query = f"INSERT INTO {table_name} ({column_list}) VALUES ({placeholders})"

    try:
        while True:
            values = []
            for col in columns:
                val = input(f"Enter value for '{col}': ").strip()
                values.append(val)

            try:
                cursor.execute(insert_query, tuple(values))
                db_connection.commit()
                print(f"Row inserted! ID: {cursor.lastrowid}")
            except Exception as e:
                db_connection.rollback()
                print(f"Insert failed: {e}")

            answer = input("Insert another row? (y/n): ").strip().lower()
            if answer != 'y':
                break
    finally:
        cursor.close()


# --- Usage ---
insert_dynamic_rows(db_connection)
db_connection.close()