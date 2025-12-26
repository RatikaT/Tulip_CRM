"""
Script to migrate data from local MongoDB to Atlas
"""
from pymongo import MongoClient
import urllib.parse

# Local MongoDB
LOCAL_URI = "mongodb://localhost:27017"
LOCAL_DB = "tulip_crm"

# Atlas MongoDB
ATLAS_URI = "mongodb+srv://richajain:MongoDb%40123@cluster0.bnsgl9v.mongodb.net/"
ATLAS_DB = "crm_db"

def migrate():
    print("Connecting to local MongoDB...")
    local_client = MongoClient(LOCAL_URI)
    local_db = local_client[LOCAL_DB]

    print("Connecting to MongoDB Atlas...")
    atlas_client = MongoClient(ATLAS_URI)
    atlas_db = atlas_client[ATLAS_DB]

    # Get all collections from local database
    collections = local_db.list_collection_names()
    print(f"Found {len(collections)} collections: {collections}")

    for collection_name in collections:
        print(f"\nMigrating collection: {collection_name}")

        local_collection = local_db[collection_name]
        atlas_collection = atlas_db[collection_name]

        # Get all documents from local
        documents = list(local_collection.find())
        print(f"  Found {len(documents)} documents")

        if documents:
            # Clear existing data in Atlas collection (optional)
            atlas_collection.delete_many({})

            # Insert all documents to Atlas
            result = atlas_collection.insert_many(documents)
            print(f"  Inserted {len(result.inserted_ids)} documents to Atlas")
        else:
            print("  No documents to migrate")

    print("\n✓ Migration complete!")

    # Close connections
    local_client.close()
    atlas_client.close()

if __name__ == "__main__":
    migrate()
