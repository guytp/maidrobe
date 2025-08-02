using Domain;
using MongoDB.Driver;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Infrastructure.Data
{
    /// <summary>
    /// Base implementation of MongoDB repository providing CRUD operations for entities
    /// </summary>
    /// <typeparam name="T">The entity type, must inherit from BaseDataObject</typeparam>
    public abstract class BaseMongoRepository<T> : IMongoRepository<T> where T : BaseDataObject
    {
        private readonly IMongoDatabase _database;
        private readonly IMongoCollection<T> _collection;

        /// <summary>
        /// Initializes a new instance of the BaseMongoRepository class
        /// </summary>
        /// <param name="database">The MongoDB database instance</param>
        public BaseMongoRepository(IMongoDatabase database)
        {
            if (database == null)
            {
                throw new ArgumentNullException(nameof(database));
            }

            _database = database;
            // Use lowercase plural collection naming convention
            var collectionName = typeof(T).Name.ToLowerInvariant() + "s";
            _collection = _database.GetCollection<T>(collectionName);
        }

        /// <summary>
        /// Retrieves an entity by its unique identifier
        /// </summary>
        /// <param name="id">The unique identifier of the entity</param>
        /// <returns>The entity if found, otherwise null</returns>
        public async Task<T> GetByIdAsync(Guid id)
        {
            try
            {
                var filter = Builders<T>.Filter.Eq(x => x.Id, id);
                return await _collection.Find(filter).FirstOrDefaultAsync();
            }
            catch (MongoException ex)
            {
                throw new InvalidOperationException($"Error retrieving entity with ID {id}", ex);
            }
        }

        /// <summary>
        /// Creates a new entity in the database
        /// </summary>
        /// <param name="entity">The entity to create</param>
        /// <returns>The created entity with updated timestamps</returns>
        public async Task<T> CreateAsync(T entity)
        {
            if (entity == null)
            {
                throw new ArgumentNullException(nameof(entity));
            }

            try
            {
                entity.DateCreated = DateTimeOffset.UtcNow;
                entity.DateUpdated = DateTimeOffset.UtcNow;
                await _collection.InsertOneAsync(entity);
                return entity;
            }
            catch (MongoException ex)
            {
                throw new InvalidOperationException("Error creating entity", ex);
            }
        }

        /// <summary>
        /// Inserts multiple entities in a single operation
        /// </summary>
        /// <param name="entities">The collection of entities to insert</param>
        /// <returns>A task representing the asynchronous operation</returns>
        public async Task InsertManyAsync(IEnumerable<T> entities)
        {
            if (entities == null)
            {
                throw new ArgumentNullException(nameof(entities));
            }

            var entitiesList = entities.ToList();
            if (!entitiesList.Any())
            {
                return;
            }

            try
            {
                var now = DateTimeOffset.UtcNow;
                foreach (var entity in entitiesList)
                {
                    entity.DateCreated = now;
                    entity.DateUpdated = now;
                }
                await _collection.InsertManyAsync(entitiesList);
            }
            catch (MongoException ex)
            {
                throw new InvalidOperationException("Error inserting multiple entities", ex);
            }
        }

        /// <summary>
        /// Updates an existing entity by replacing it entirely
        /// </summary>
        /// <param name="entity">The entity with updated values</param>
        /// <returns>The updated entity with refreshed timestamp</returns>
        public async Task<T> UpdateAsync(T entity)
        {
            if (entity == null)
            {
                throw new ArgumentNullException(nameof(entity));
            }

            try
            {
                entity.DateUpdated = DateTimeOffset.UtcNow;
                var filter = Builders<T>.Filter.Eq(x => x.Id, entity.Id);
                var result = await _collection.ReplaceOneAsync(filter, entity);

                if (result.MatchedCount == 0)
                {
                    throw new InvalidOperationException($"Entity with ID {entity.Id} not found");
                }

                return entity;
            }
            catch (MongoException ex)
            {
                throw new InvalidOperationException($"Error updating entity with ID {entity.Id}", ex);
            }
        }

        /// <summary>
        /// Deletes an entity by its identifier
        /// </summary>
        /// <param name="id">The unique identifier of the entity to delete</param>
        /// <returns>A task representing the asynchronous delete operation</returns>
        public async Task DeleteAsync(Guid id)
        {
            try
            {
                var filter = Builders<T>.Filter.Eq(x => x.Id, id);
                var result = await _collection.DeleteOneAsync(filter);

                if (result.DeletedCount == 0)
                {
                    throw new InvalidOperationException($"Entity with ID {id} not found");
                }
            }
            catch (MongoException ex)
            {
                throw new InvalidOperationException($"Error deleting entity with ID {id}", ex);
            }
        }

        /// <summary>
        /// Partially updates an entity with specified updates and property names
        /// </summary>
        /// <param name="id">The unique identifier of the entity to update</param>
        /// <param name="updates">An object containing the fields to update</param>
        /// <param name="propertyNames">Array of property names to update</param>
        /// <returns>A task representing the asynchronous patch operation</returns>
        public async Task PatchAsync(Guid id, object updates, params string[] propertyNames)
        {
            if (updates == null)
            {
                throw new ArgumentNullException(nameof(updates));
            }

            try
            {
                var filter = Builders<T>.Filter.Eq(x => x.Id, id);
                var updateDefinition = Builders<T>.Update.Set(x => x.DateUpdated, DateTimeOffset.UtcNow);

                foreach (var property in updates.GetType().GetProperties())
                {
                    if (propertyNames.Length == 0 || propertyNames.Contains(property.Name))
                    {
                        var value = property.GetValue(updates);
                        if (value != null)
                        {
                            updateDefinition = updateDefinition.Set(property.Name, value);
                        }
                    }
                }

                var result = await _collection.UpdateOneAsync(filter, updateDefinition);

                if (result.MatchedCount == 0)
                {
                    throw new InvalidOperationException($"Entity with ID {id} not found");
                }
            }
            catch (MongoException ex)
            {
                throw new InvalidOperationException($"Error patching entity with ID {id}", ex);
            }
        }


    }
}