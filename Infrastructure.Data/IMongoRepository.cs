using Domain;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Infrastructure.Data
{
    public interface IMongoRepository<T> : IRepository<T> where T : BaseDataObject
    {
        // MongoDB-specific overloads using string IDs
        Task<T?> GetByIdAsync(string id);
        Task InsertAsync(T entity);
        new Task<T> UpdateAsync(T entity);
        Task PatchAsync(string id, object updates);
        Task DeleteAsync(string id);
    }
}