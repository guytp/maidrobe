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
    public class BaseMongoRepository<T> : IMongoRepository<T> where T : BaseDataObject
    {
        private readonly IMongoDatabase _database;
        private readonly IMongoCollection<T> _collection;

        /// <summary>
        /// Initializes a new instance of the BaseMongoRepository class
        /// </summary>
        /// <param name="database">The MongoDB database instance</param>
        public BaseMongoRepository(IMongoDatabase database)
        {
            _database = database;
            _collection = _database.GetCollection<T>(typeof(T).Name);
        }

        /// <summary>
        /// Retrieves an entity by its unique identifier
        /// </summary>
        /// <param name="id">The unique identifier of the entity</param>
        /// <returns>The entity if found, otherwise null</returns>
        public async Task<T> GetByIdAsync(Guid id)
        {
            var filter = Builders<T>.Filter.Eq(x => x.Id, id);
            return await _collection.Find(filter).FirstOrDefaultAsync();
        }

        /// <summary>
        /// Creates a new entity in the database
        /// </summary>
        /// <param name="entity">The entity to create</param>
        /// <returns>The created entity with updated timestamps</returns>
        public async Task<T> CreateAsync(T entity)
        {
            entity.DateCreated = DateTimeOffset.UtcNow;
            entity.DateUpdated = DateTimeOffset.UtcNow;
            await _collection.InsertOneAsync(entity);
            return entity;
        }

        /// <summary>
        /// Inserts multiple entities in a single operation
        /// </summary>
        /// <param name="entities">The collection of entities to insert</param>
        /// <returns>A task representing the asynchronous operation</returns>
        public async Task InsertManyAsync(IEnumerable<T> entities)
        {
            var entitiesList = entities.ToList();
            var now = DateTimeOffset.UtcNow;
            foreach (var entity in entitiesList)
            {
                entity.DateCreated = now;
                entity.DateUpdated = now;
            }
            await _collection.InsertManyAsync(entitiesList);
        }

        /// <summary>
        /// Updates an existing entity by replacing it entirely
        /// </summary>
        /// <param name="entity">The entity with updated values</param>
        /// <returns>The updated entity with refreshed timestamp</returns>
        public async Task<T> UpdateAsync(T entity)
        {
            entity.DateUpdated = DateTimeOffset.UtcNow;
            var filter = Builders<T>.Filter.Eq(x => x.Id, entity.Id);
            await _collection.ReplaceOneAsync(filter, entity);
            return entity;
        }

        /// <summary>
        /// Deletes an entity by its identifier
        /// </summary>
        /// <param name="id">The unique identifier of the entity to delete</param>
        /// <returns>A task representing the asynchronous delete operation</returns>
        public async Task DeleteAsync(Guid id)
        {
            var filter = Builders<T>.Filter.Eq(x => x.Id, id);
            await _collection.DeleteOneAsync(filter);
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
            var filter = Builders<T>.Filter.Eq(x => x.Id, id);
            var updateDefinition = Builders<T>.Update.Set(x => x.DateUpdated, DateTimeOffset.UtcNow);

            if (updates != null)
            {
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
            }

            await _collection.UpdateOneAsync(filter, updateDefinition);
        }

        /// <summary>
        /// Partially updates an entity by applying only the specified field updates
        /// </summary>
        /// <param name="id">The unique identifier of the entity to update</param>
        /// <param name="updates">An object containing the fields to update. Use anonymous objects with nameof() for type-safe field selection</param>
        /// <returns>A task representing the asynchronous patch operation</returns>
        public async Task PatchAsync(Guid id, object updates)
        {
            await PatchAsync(id, updates, new string[0]);
        }

    }
}