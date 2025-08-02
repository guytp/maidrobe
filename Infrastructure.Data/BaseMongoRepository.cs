using Domain;
using MongoDB.Driver;
using System;
using System.Threading.Tasks;

namespace Infrastructure.Data
{
    public class BaseMongoRepository<T> : IMongoRepository<T> where T : BaseDataObject
    {
        private readonly IMongoDatabase _database;
        private readonly IMongoCollection<T> _collection;

        public BaseMongoRepository(IMongoDatabase database)
        {
            _database = database;
            _collection = _database.GetCollection<T>(typeof(T).Name);
        }

        public async Task<T> GetByIdAsync(string id)
        {
            var filter = Builders<T>.Filter.Eq(x => x.Id, id);
            return await _collection.Find(filter).FirstOrDefaultAsync();
        }

        public async Task<T> CreateAsync(T entity)
        {
            entity.DateCreated = DateTime.UtcNow;
            entity.DateUpdated = DateTime.UtcNow;
            await _collection.InsertOneAsync(entity);
            return entity;
        }

        public async Task InsertAsync(T entity)
        {
            entity.DateCreated = DateTime.UtcNow;
            entity.DateUpdated = DateTime.UtcNow;
            await _collection.InsertOneAsync(entity);
        }

        public async Task UpdateAsync(T entity)
        {
            entity.DateUpdated = DateTime.UtcNow;
            var filter = Builders<T>.Filter.Eq(x => x.Id, entity.Id);
            await _collection.ReplaceOneAsync(filter, entity);
        }

        public async Task PatchAsync(string id, object updates)
        {
            var filter = Builders<T>.Filter.Eq(x => x.Id, id);
            var updateDefinition = Builders<T>.Update.Set(x => x.DateUpdated, DateTime.UtcNow);
            
            foreach (var property in updates.GetType().GetProperties())
            {
                var value = property.GetValue(updates);
                if (value != null)
                {
                    updateDefinition = updateDefinition.Set(property.Name, value);
                }
            }
            
            await _collection.UpdateOneAsync(filter, updateDefinition);
        }

        public async Task DeleteAsync(string id)
        {
            var filter = Builders<T>.Filter.Eq(x => x.Id, id);
            await _collection.DeleteOneAsync(filter);
        }
    }
}